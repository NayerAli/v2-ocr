// User profile service for user profile management

import { getSupabaseClient } from './supabase/singleton-client'
import { getUser } from './auth'

interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  organization?: string
  role: string
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface CachedData<T> {
  data: T
  timestamp: number
}

class UserProfileService {
  private supabase
  private cache: Map<string, CachedData<UserProfile | UserProfile[]>>
  private cacheTTL: number

  constructor() {
    this.supabase = getSupabaseClient()
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5 minutes
  }

  /**
   * Get the current authenticated user
   */
  async getCurrentUser() {
    const user = await getUser()
    if (!user) {
      throw new Error('Not authenticated')
    }
    return user
  }

  /**
   * Get the current user's profile
   */
  async getProfile(): Promise<UserProfile> {
    try {
      const user = await this.getCurrentUser()

      // Check cache first
      const cacheKey = `profile_${user.id}`
      const cachedProfile = this.cache.get(cacheKey)

      if (cachedProfile && cachedProfile.timestamp > Date.now() - this.cacheTTL) {
        return cachedProfile.data as UserProfile
      }

      // Fetch from database
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        throw error
      }

      if (!data) {
        // If profile doesn't exist, create a new one
        return this.createDefaultProfile(user)
      }

      // Update cache
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      })

      return data
    } catch (error) {
      console.error('Error in getProfile:', error)
      throw error
    }
  }

  /**
   * Create a default profile for a user
   */
  private async createDefaultProfile(user: { id: string; email?: string | undefined }): Promise<UserProfile> {
    const defaultProfile = {
      id: user.id,
      email: user.email || '',
      full_name: '',
      avatar_url: '',
      organization: '',
      role: 'user',
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await this.supabase
      .from('user_profiles')
      .insert(defaultProfile)
      .select()
      .single()

    if (error) {
      console.error('Error creating default profile:', error)
      throw error
    }

    // Update cache
    this.cache.set(`profile_${user.id}`, {
      data: data || defaultProfile,
      timestamp: Date.now()
    })

    return data || defaultProfile
  }

  /**
   * Update the current user's profile
   */
  async updateProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const user = await this.getCurrentUser()

      // Validate profile
      if (!profile || typeof profile !== 'object') {
        throw new Error('Invalid profile object')
      }

      // Get current profile to merge with updates
      const currentProfile = await this.getProfile()

      // Prepare updates (only allow updating certain fields)
      const updates = {
        full_name: profile.full_name !== undefined ? profile.full_name : currentProfile.full_name,
        avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : currentProfile.avatar_url,
        organization: profile.organization !== undefined ? profile.organization : currentProfile.organization,
        preferences: profile.preferences ? { ...currentProfile.preferences, ...profile.preferences } : currentProfile.preferences,
        updated_at: new Date().toISOString()
      }

      // Update in database
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating user profile:', error)
        throw error
      }

      // Clear cache
      this.cache.delete(`profile_${user.id}`)

      return data
    } catch (error) {
      console.error('Error in updateProfile:', error)
      throw error
    }
  }

  /**
   * Get a user profile by ID (admin only)
   */
  async getProfileById(id: string): Promise<UserProfile> {
    try {
      const user = await this.getCurrentUser()

      // Check if user is an admin
      const { data: adminCheck, error: adminError } = await this.supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (adminError || !adminCheck || adminCheck.role !== 'admin') {
        throw new Error('Unauthorized: Admin access required')
      }

      // Fetch profile
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error fetching user profile by ID:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Error in getProfileById:', error)
      throw error
    }
  }

  /**
   * Update a user profile by ID (admin only)
   */
  async updateProfileById(id: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const user = await this.getCurrentUser()

      // Check if user is an admin
      const { data: adminCheck, error: adminError } = await this.supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (adminError || !adminCheck || adminCheck.role !== 'admin') {
        throw new Error('Unauthorized: Admin access required')
      }

      // Validate profile
      if (!profile || typeof profile !== 'object') {
        throw new Error('Invalid profile object')
      }

      // Get current profile to merge with updates
      const { data: currentProfile, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (profileError || !currentProfile) {
        throw new Error('Profile not found')
      }

      // Prepare updates (admins can update all fields)
      const updates = {
        full_name: profile.full_name !== undefined ? profile.full_name : currentProfile.full_name,
        avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : currentProfile.avatar_url,
        organization: profile.organization !== undefined ? profile.organization : currentProfile.organization,
        role: profile.role !== undefined ? profile.role : currentProfile.role,
        preferences: profile.preferences ? { ...currentProfile.preferences, ...profile.preferences } : currentProfile.preferences,
        updated_at: new Date().toISOString()
      }

      // Update in database
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating user profile by ID:', error)
        throw error
      }

      // Clear cache if it's the current user's profile
      if (id === user.id) {
        this.cache.delete(`profile_${user.id}`)
      }

      return data
    } catch (error) {
      console.error('Error in updateProfileById:', error)
      throw error
    }
  }

  /**
   * Get all user profiles (admin only)
   */
  async getAllProfiles(): Promise<UserProfile[]> {
    try {
      const user = await this.getCurrentUser()

      // Check if user is an admin
      const { data: adminCheck, error: adminError } = await this.supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (adminError || !adminCheck || adminCheck.role !== 'admin') {
        throw new Error('Unauthorized: Admin access required')
      }

      // Check cache first
      const cacheKey = 'all_profiles'
      const cachedProfiles = this.cache.get(cacheKey)

      if (cachedProfiles && cachedProfiles.timestamp > Date.now() - this.cacheTTL) {
        return cachedProfiles.data as UserProfile[]
      }

      // Fetch all profiles
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching all user profiles:', error)
        throw error
      }

      // Update cache
      this.cache.set(cacheKey, {
        data: data || [],
        timestamp: Date.now()
      })

      return data || []
    } catch (error) {
      console.error('Error in getAllProfiles:', error)
      throw error
    }
  }

  /**
   * Clear the profile cache
   */
  clearCache(): void {
    this.cache = new Map()
  }
}

// Create a singleton instance of the user profile service
export const userProfileService = new UserProfileService()
