import { createClient } from "@/utils/supabase/client";
import { GamePlayer, GameRoom } from "./game-service";
import { User } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

export type ChatChannel = 'lobby' | 'round' | 'private';

export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  channel: ChatChannel;
  is_system: boolean;
  round_number?: number | null;
  created_at: string;
  // Added profile data for easy display
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  game_alias?: string | null;
};

export class ChatService {
  private static supabase = createClient();
  private static roomSubscriptions: Map<string, RealtimeChannel> = new Map();
  private static messageHistory: Map<string, ChatMessage[]> = new Map();

  /**
   * Send a chat message using the broadcasting system
   */
  static async sendMessage(
    roomId: string,
    message: string,
    channel: ChatChannel = 'lobby',
    roundNumber?: number | null
  ): Promise<ChatMessage | null> {
    if (!message.trim()) return null;

    try {
      // Check if user is authenticated
      const { data: userData } = await this.supabase.auth.getUser();
      if (!userData?.user) {
        console.error('Error sending message: User is not authenticated');
        throw new Error('User is not authenticated');
      }

      const userId = userData.user.id;
      
      // Get user profile and game alias
      const { data: profileData } = await this.supabase
        .from('profiles')
        .select('username, full_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      const { data: playerData } = await this.supabase
        .from('game_players')
        .select('game_alias')
        .eq('user_id', userId)
        .eq('room_id', roomId)
        .maybeSingle();

      // Create message object
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        room_id: roomId,
        user_id: userId,
        message,
        channel,
        is_system: false,
        round_number: roundNumber || null,
        created_at: new Date().toISOString(),
        username: profileData?.username || null,
        full_name: profileData?.full_name || null,
        avatar_url: profileData?.avatar_url || null,
        game_alias: playerData?.game_alias || null
      };

      // Log debug info
      console.log('Sending broadcast message:', { 
        roomId, 
        userId, 
        channel,
        messageLength: message.length 
      });

      // Send via broadcast
      const broadcastChannel = this.supabase.channel(`room-${roomId}-chat`);
      await broadcastChannel.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: chatMessage
      });

      // Add to local history
      const historyKey = `${roomId}-${channel}-${roundNumber || 'all'}`;
      const history = this.messageHistory.get(historyKey) || [];
      history.push(chatMessage);
      this.messageHistory.set(historyKey, history);

      return chatMessage;
    } catch (error) {
      console.error('Error in sendMessage:', error);
      throw error;
    }
  }

  /**
   * Get messages from local history (since we're using broadcasting)
   */
  static async getRoomMessages(
    roomId: string,
    options: {
      channel?: ChatChannel;
      roundNumber?: number;
      limit?: number;
    } = {}
  ): Promise<ChatMessage[]> {
    const { channel, roundNumber, limit = 50 } = options;
    
    try {
      // Check for valid room ID
      if (!roomId) {
        throw new Error("Room ID is required");
      }
      
      // Get from local history
      const historyKey = `${roomId}-${channel || 'all'}-${roundNumber || 'all'}`;
      const history = this.messageHistory.get(historyKey) || [];
      
      // Filter and limit
      let filteredMessages = history;
      
      if (channel) {
        filteredMessages = filteredMessages.filter(msg => msg.channel === channel);
      }
      
      if (roundNumber !== undefined) {
        filteredMessages = filteredMessages.filter(msg => msg.round_number === roundNumber);
      }
      
      // Return most recent messages up to limit
      return filteredMessages.slice(-limit);
    } catch (error) {
      console.error('Error in getRoomMessages:', error);
      throw error;
    }
  }

  /**
   * Subscribe to messages using the broadcasting system
   */
  static subscribeToRoomMessages(
    roomId: string,
    options: {
      channel?: ChatChannel;
      roundNumber?: number;
    } = {},
    callback: (message: ChatMessage) => void
  ): () => void {
    const { channel, roundNumber } = options;
    const subscriptionKey = `room-${roomId}-${channel || 'all'}-${roundNumber || 'all'}`;
    
    console.log(`Setting up broadcast subscription for key: ${subscriptionKey}`);
    
    // Return early if we already have a subscription for this combination
    if (this.roomSubscriptions.has(subscriptionKey)) {
      console.log(`Reusing existing subscription for key: ${subscriptionKey}`);
      return () => this.unsubscribeFromRoomMessages(subscriptionKey);
    }

    try {
      // Create the broadcast channel
      const channelObj = this.supabase.channel(`room-${roomId}-chat-${subscriptionKey}`);
      
      // Add the broadcast listener
      channelObj.on('broadcast', 
        { event: 'chat_message' }, 
        (payload) => {
          console.log('Received broadcast chat message:', payload);
          try {
            const message = payload.payload as ChatMessage;
            
            // Filter based on options
            if (channel && message.channel !== channel) {
              return;
            }
            
            if (roundNumber !== undefined && message.round_number !== roundNumber) {
              return;
            }
            
            // Add to local history
            const historyKey = `${roomId}-${message.channel}-${message.round_number || 'all'}`;
            const history = this.messageHistory.get(historyKey) || [];
            history.push(message);
            this.messageHistory.set(historyKey, history);
            
            // Send to callback
            callback(message);
          } catch (error) {
            console.error('Error in broadcast message handler:', error);
          }
        }
      );
      
      // Subscribe to the channel
      channelObj.subscribe((status) => {
        console.log(`Broadcast subscription status for ${subscriptionKey}:`, status);
      });

      // Store the channel for later cleanup
      this.roomSubscriptions.set(subscriptionKey, channelObj);
      console.log(`Added broadcast subscription to map. Current subscriptions:`, 
        Array.from(this.roomSubscriptions.keys()));

      // Return unsubscribe function
      return () => this.unsubscribeFromRoomMessages(subscriptionKey);
    } catch (error) {
      console.error('Error setting up broadcast subscription:', error);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a room's messages
   */
  static unsubscribeFromRoomMessages(subscriptionKey: string): void {
    console.log(`Unsubscribing from ${subscriptionKey}`);
    const channel = this.roomSubscriptions.get(subscriptionKey);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.roomSubscriptions.delete(subscriptionKey);
      console.log(`Removed subscription ${subscriptionKey}. Remaining:`, 
        Array.from(this.roomSubscriptions.keys()));
    } else {
      console.warn(`No subscription found for key: ${subscriptionKey}`);
    }
  }

  /**
   * Clear round-specific messages from local history
   */
  static async clearRoundMessages(
    roomId: string,
    roundNumber?: number
  ): Promise<boolean> {
    try {
      const historyKey = `${roomId}-round-${roundNumber || 'all'}`;
      this.messageHistory.delete(historyKey);
      return true;
    } catch (error) {
      console.error('Error in clearRoundMessages:', error);
      return false;
    }
  }

  /**
   * Send a system message using the broadcasting system
   */
  static async sendSystemMessage(
    roomId: string,
    message: string,
    channel: ChatChannel = 'lobby',
    roundNumber?: number | null
  ): Promise<ChatMessage | null> {
    if (!message.trim()) return null;

    try {
      // Create system message object
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        room_id: roomId,
        user_id: 'system',
        message,
        channel,
        is_system: true,
        round_number: roundNumber || null,
        created_at: new Date().toISOString(),
        username: 'System',
        full_name: 'System',
        avatar_url: null,
        game_alias: 'System'
      };

      // Log debug info
      console.log('Sending system broadcast message:', { 
        roomId, 
        channel,
        messageLength: message.length 
      });

      // Send via broadcast
      const broadcastChannel = this.supabase.channel(`room-${roomId}-chat`);
      await broadcastChannel.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: chatMessage
      });

      // Add to local history
      const historyKey = `${roomId}-${channel}-${roundNumber || 'all'}`;
      const history = this.messageHistory.get(historyKey) || [];
      history.push(chatMessage);
      this.messageHistory.set(historyKey, history);

      return chatMessage;
    } catch (error) {
      console.error('Error in sendSystemMessage:', error);
      throw error;
    }
  }
} 