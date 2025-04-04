import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Image as ImageIcon, Smile, Paperclip } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Message {
  id: string;
  content: string;
  created_at: string;
  user: {
    username: string;
    avatar_url: string;
  };
}

interface ChannelChatProps {
  channelId: string;
  channelName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChannelChat({ channelId, channelName, isOpen, onClose }: ChannelChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
      const subscription = subscribeToMessages();
      document.body.style.overflow = 'hidden';
      return () => {
        subscription.unsubscribe();
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, channelId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('channel_messages')
        .select(`
          id,
          content,
          created_at,
          user:profiles(username, avatar_url)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const subscribeToMessages = () => {
    return supabase
      .channel('channel_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`
        },
        async (payload) => {
          // Fetch the complete message with user details
          const { data, error } = await supabase
            .from('channel_messages')
            .select(`
              id,
              content,
              created_at,
              user:profiles(username, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (!error && data) {
            setMessages(prev => [...prev, data]);
          }
        }
      )
      .subscribe();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('channel_messages')
        .insert([
          {
            channel_id: channelId,
            user_id: user.id,
            content: newMessage.trim()
          }
        ]);

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300"
      onClick={onClose}
    >
      <div 
        className={`fixed inset-x-0 bottom-0 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-white rounded-t-xl max-h-[90vh] flex flex-col">
          {/* Handle */}
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto my-3" />

          {/* Header */}
          <div className="p-4 border-b flex justify-between items-center bg-blue-600 text-white">
            <h3 className="font-semibold">{channelName}</h3>
            <button onClick={onClose} className="hover:text-gray-200">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-2 ${
                  message.user.username === user?.email ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                <img
                  src={message.user.avatar_url || 'https://via.placeholder.com/40'}
                  alt={message.user.username}
                  className="w-8 h-8 rounded-full"
                />
                <div
                  className={`max-w-[70%] ${
                    message.user.username === user?.email
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100'
                  } rounded-lg p-3`}
                >
                  <p className="text-sm font-medium mb-1">{message.user.username}</p>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
              >
                <Smile className="h-5 w-5" />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrivez votre message..."
                className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !newMessage.trim()}
                className="bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}