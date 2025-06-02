'use client'

import { useEffect, useRef, useCallback } from 'react'

export function useChatScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTop = useRef(0)
  const userScrolled = useRef(false)
  const lastMessageCount = useRef(0)

  // Detect if user has scrolled up
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      // If user scrolls up, mark as user scrolled
      if (scrollTop < lastScrollTop.current) {
        userScrolled.current = true
      }
      
      // If user scrolls to bottom, reset
      if (scrollTop + container.clientHeight >= container.scrollHeight - 30) {
        userScrolled.current = false
      }
      
      lastScrollTop.current = scrollTop
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Try to scroll immediately after the component mounts
  useEffect(() => {
    // Initial scroll to bottom with a short delay to ensure DOM is ready
    setTimeout(() => {
      const container = containerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }, 100)
  }, [])

  // Scroll to bottom function that respects user scrolling
  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  return { containerRef, scrollToBottom }
} 