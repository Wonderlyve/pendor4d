import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Post {
  id: string;
  content: string;
  image_url: string | null;
  odds: number;
  confidence: number;
  created_at: string;
  likes: number;
  comments: number;
  shares: number;
  user: {
    username: string;
    avatar_url: string;
  };
}

interface PostContextType {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  addPost: (post: { text: string; image: string | null; totalOdds: string; confidence: number }) => Promise<void>;
  fetchMorePosts: () => Promise<void>;
}

const PostContext = createContext<PostContextType | undefined>(undefined);

const POSTS_PER_PAGE = 20;

export function PostProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchMorePosts = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const fetchPromise = supabase
        .from('posts')
        .select(`
          *,
          user:profiles(username, avatar_url)
        `)
        .range(page * POSTS_PER_PAGE, (page + 1) * POSTS_PER_PAGE - 1)
        .order('created_at', { ascending: false });

      // Increase timeout to 30 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), 30000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise])
        .then(result => result as Awaited<ReturnType<typeof fetchPromise>>);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (data) {
        // Deduplicate posts in case of reload
        const uniquePosts = data.filter(
          newPost => !posts.some(existingPost => existingPost.id === newPost.id)
        );
        
        setPosts(prev => [...prev, ...uniquePosts]);
        setHasMore(data.length === POSTS_PER_PAGE);
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      // Don't set hasMore to false on timeout, allow retrying
      if (!(error instanceof Error && error.message.includes('timeout'))) {
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore, posts]);

  const addPost = async (newPost: { text: string; image: string | null; totalOdds: string; confidence: number }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Ensure totalOdds is a string and handle undefined/null cases
      const oddsString = (newPost.totalOdds || '0').replace(',', '.');
      const odds = parseFloat(oddsString);
      
      if (isNaN(odds)) {
        throw new Error('Invalid odds value');
      }

      const { data, error } = await supabase
        .from('posts')
        .insert([
          {
            content: newPost.text,
            image_url: newPost.image,
            odds: odds,
            confidence: newPost.confidence,
            user_id: user.id,
            likes: 0,
            comments: 0,
            shares: 0
          }
        ])
        .select(`
          *,
          user:profiles(username, avatar_url)
        `)
        .single();

      if (error) throw error;

      if (data) {
        setPosts(prev => [data, ...prev]);
      }
    } catch (error) {
      console.error('Error adding post:', error);
      throw error;
    }
  };

  return (
    <PostContext.Provider value={{ posts, loading, hasMore, addPost, fetchMorePosts }}>
      {children}
    </PostContext.Provider>
  );
}

export function usePosts() {
  const context = useContext(PostContext);
  if (context === undefined) {
    throw new Error('usePosts must be used within a PostProvider');
  }
  return context;
}