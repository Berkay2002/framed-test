'use client'

import { createClient } from '@/utils/supabase/client'
import { useCallback, useEffect, useState, useRef } from 'react'

interface UseRealtimeChatProps {
  roomName: string
  username: string
}

export interface ChatMessage {
  id: string
  content: string
  user: {
    name: string
  }
  createdAt: string
}

const EVENT_MESSAGE_TYPE = 'message'

export function useRealtimeChat({ roomName, username }: UseRealtimeChatProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const cleanupRef = useRef(false)

  useEffect(() => {
    // Reset cleanup flag
    cleanupRef.current = false
    
    console.log(`🚀 Setting up chat channel: ${roomName}`)
    
    // Clean up any existing channel first
    if (channelRef.current) {
      console.log(`🧹 Cleaning up previous channel: ${roomName}`)
      try {
        supabase.removeChannel(channelRef.current)
      } catch (error) {
        console.warn('Error removing previous channel:', error)
      }
      channelRef.current = null
      setIsConnected(false)
    }
    
    // Create and execute setup function
    const setupChannel = async () => {
      // Check if this setup was cancelled
      if (cleanupRef.current) {
        return
      }

      const { data: { user }, error } = await supabase.auth.getUser()
      console.log(`🔐 Auth check for chat:`, { 
        user: user?.id || 'No user', 
        error: error?.message || 'No error',
        roomName 
      })
      
      if (!user || cleanupRef.current) {
        if (!user) console.error('❌ No authenticated user for chat!')
        return
      }
      
      // Use the exact roomName without modification to ensure all users join the same channel
      // This is critical for all players to see each other's messages
      const newChannel = supabase.channel(roomName, {
        config: { 
          private: true,
          broadcast: { self: true }
        },
      })

      // Check again if we were cancelled during async operation
      if (cleanupRef.current) {
        try {
          supabase.removeChannel(newChannel)
        } catch (error) {
          console.warn('Error removing cancelled channel:', error)
        }
        return
      }

      // Store the channel reference
      channelRef.current = newChannel

      console.log(`📡 Subscribing to channel: ${roomName}`)
      
      newChannel
        .on('broadcast', { event: EVENT_MESSAGE_TYPE }, (payload) => {
          if (cleanupRef.current) return
          console.log(`📨 Received message in ${roomName}:`, payload)
          setMessages((current) => {
            const message = payload.payload as ChatMessage
            if (current.some(m => m.id === message.id)) {
              return current
            }
            return [...current, message]
          })
        })
        .subscribe(async (status, err) => {
          if (cleanupRef.current) return
          
          console.log(`📡 Chat channel ${roomName} status: ${status}`)
          if (err) {
            console.error(`❌ Chat channel ${roomName} error:`, err)
          }
          
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            console.log(`✅ Chat connected: ${roomName}`)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setIsConnected(false)
            console.error(`💥 Chat connection failed: ${status} for ${roomName}`)
          }
        })
    }

    // Execute setup
    setupChannel()

    return () => {
      console.log(`🧹 Cleaning up chat channel: ${roomName}`)
      cleanupRef.current = true
      setIsConnected(false)
      
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current)
        } catch (error) {
          console.warn('Error removing channel:', error)
        }
        channelRef.current = null
      }
    }
  }, [roomName, username, supabase])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!channelRef.current || !isConnected || cleanupRef.current) {
        console.warn(`⚠️ Cannot send message to ${roomName}: channel not connected`)
        return
      }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        content,
        user: {
          name: username,
        },
        createdAt: new Date().toISOString(),
      }

      console.log(`📤 Sending message to ${roomName}:`, message)

      try {
        const result = await channelRef.current.send({
          type: 'broadcast',
          event: EVENT_MESSAGE_TYPE,
          payload: message,
        })
        
        console.log(`✅ Message sent to ${roomName}:`, result)
      } catch (error) {
        console.error(`❌ Error sending message to ${roomName}:`, error)
      }
    },
    [isConnected, username, roomName]
  )

  return { messages, sendMessage, isConnected }
}
