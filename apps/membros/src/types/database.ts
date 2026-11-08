export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          bio: string | null
          role: 'student' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          role?: 'student' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          role?: 'student' | 'admin'
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          slug: string
          title: string
          description: string | null
          short_description: string | null
          thumbnail_url: string | null
          product_type: 'course' | 'ebook' | 'bundle' | 'mentorship' | 'event'
          is_published: boolean
          is_featured: boolean
          sort_order: number
          price: number | null
          original_price: number | null
          currency: string
          payment_type: 'one_time' | 'subscription' | 'free'
          cta_label: string | null
          highlights: string[] | null
          badge_label: string | null
          checkout_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          description?: string | null
          short_description?: string | null
          thumbnail_url?: string | null
          product_type?: 'course' | 'ebook' | 'bundle' | 'mentorship' | 'event'
          is_published?: boolean
          is_featured?: boolean
          sort_order?: number
          price?: number | null
          original_price?: number | null
          currency?: string
          payment_type?: 'one_time' | 'subscription' | 'free'
          cta_label?: string | null
          highlights?: string[] | null
          badge_label?: string | null
          checkout_url?: string | null
          created_by?: string | null
        }
        Update: {
          slug?: string
          title?: string
          description?: string | null
          short_description?: string | null
          thumbnail_url?: string | null
          product_type?: 'course' | 'ebook' | 'bundle' | 'mentorship' | 'event'
          is_published?: boolean
          is_featured?: boolean
          sort_order?: number
          price?: number | null
          original_price?: number | null
          currency?: string
          payment_type?: 'one_time' | 'subscription' | 'free'
          cta_label?: string | null
          highlights?: string[] | null
          badge_label?: string | null
          checkout_url?: string | null
        }
      }
      modules: {
        Row: {
          id: string
          product_id: string
          title: string
          description: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          title: string
          description?: string | null
          sort_order?: number
        }
        Update: {
          title?: string
          description?: string | null
          sort_order?: number
        }
      }
      lessons: {
        Row: {
          id: string
          module_id: string
          title: string
          description: string | null
          lesson_type: 'video' | 'text' | 'file'
          video_url: string | null
          video_duration: number | null
          content: string | null
          file_url: string | null
          is_free_preview: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          module_id: string
          title: string
          description?: string | null
          lesson_type?: 'video' | 'text' | 'file'
          video_url?: string | null
          video_duration?: number | null
          content?: string | null
          file_url?: string | null
          is_free_preview?: boolean
          sort_order?: number
        }
        Update: {
          title?: string
          description?: string | null
          lesson_type?: 'video' | 'text' | 'file'
          video_url?: string | null
          video_duration?: number | null
          content?: string | null
          file_url?: string | null
          is_free_preview?: boolean
          sort_order?: number
        }
      }
      enrollments: {
        Row: {
          id: string
          user_id: string
          product_id: string
          enrolled_at: string
          expires_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          expires_at?: string | null
          is_active?: boolean
        }
        Update: {
          expires_at?: string | null
          is_active?: boolean
        }
      }
      progress: {
        Row: {
          id: string
          user_id: string
          lesson_id: string
          completed: boolean
          completed_at: string | null
          watch_seconds: number
        }
        Insert: {
          id?: string
          user_id: string
          lesson_id: string
          completed?: boolean
          completed_at?: string | null
          watch_seconds?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          watch_seconds?: number
        }
      }
      testimonials: {
        Row: {
          id: string
          product_id: string | null
          author_name: string
          author_role: string | null
          avatar_url: string | null
          content: string
          rating: number | null
          is_featured: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          author_name: string
          author_role?: string | null
          avatar_url?: string | null
          content: string
          rating?: number | null
          is_featured?: boolean
          sort_order?: number
        }
        Update: {
          product_id?: string | null
          author_name?: string
          author_role?: string | null
          avatar_url?: string | null
          content?: string
          rating?: number | null
          is_featured?: boolean
          sort_order?: number
        }
      }
      payments: {
        Row: {
          id: string
          user_id: string
          product_id: string
          mp_preference_id: string | null
          mp_payment_id: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded'
          amount: number
          currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          mp_preference_id?: string | null
          mp_payment_id?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded'
          amount: number
          currency?: string
        }
        Update: {
          mp_preference_id?: string | null
          mp_payment_id?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded'
          updated_at?: string
        }
      }
      achievements: {
        Row: {
          id: string
          slug: string
          title: string
          description: string | null
          icon: string | null
          xp_reward: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          description?: string | null
          icon?: string | null
          xp_reward?: number
        }
        Update: {
          title?: string
          description?: string | null
          icon?: string | null
          xp_reward?: number
        }
      }
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          user_id: string
          achievement_id: string
          unlocked_at?: string
        }
        Update: {
          unlocked_at?: string
        }
      }
      partner_themes: {
        Row: {
          id: string
          name: string
          primary_color: string
          secondary_color: string
          accent_color: string
          font_family: string
          background_preset: 'aurora' | 'waves' | 'orbs' | 'particles' | 'geometric'
          background_config: Json
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          primary_color: string
          secondary_color: string
          accent_color: string
          font_family?: string
          background_preset: 'aurora' | 'waves' | 'orbs' | 'particles' | 'geometric'
          background_config?: Json
          created_at?: string
        }
        Update: {
          name?: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          font_family?: string
          background_preset?: 'aurora' | 'waves' | 'orbs' | 'particles' | 'geometric'
          background_config?: Json
        }
      }
      partners: {
        Row: {
          id: string
          slug: string
          name: string
          tagline: string | null
          bio: string | null
          avatar_url: string | null
          theme_id: string | null
          status: 'draft' | 'published'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          tagline?: string | null
          bio?: string | null
          avatar_url?: string | null
          theme_id?: string | null
          status?: 'draft' | 'published'
          created_at?: string
          updated_at?: string
        }
        Update: {
          slug?: string
          name?: string
          tagline?: string | null
          bio?: string | null
          avatar_url?: string | null
          theme_id?: string | null
          status?: 'draft' | 'published'
          updated_at?: string
        }
      }
      partner_links: {
        Row: {
          id: string
          partner_id: string
          label: string
          url: string
          icon: string | null
          position: number
          type: 'link' | 'social' | 'destaque'
          is_active: boolean
          click_count: number
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          label: string
          url: string
          icon?: string | null
          position?: number
          type?: 'link' | 'social' | 'destaque'
          is_active?: boolean
          click_count?: number
          created_at?: string
        }
        Update: {
          label?: string
          url?: string
          icon?: string | null
          position?: number
          type?: 'link' | 'social' | 'destaque'
          is_active?: boolean
          click_count?: number
        }
      }
    }
    Views: {
      course_progress: {
        Row: {
          user_id: string
          product_id: string
          total_lessons: number
          completed_lessons: number
          percent_complete: number
        }
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_enrolled: {
        Args: { p_product_id: string }
        Returns: boolean
      }
    }
    Enums: {}
  }
}
