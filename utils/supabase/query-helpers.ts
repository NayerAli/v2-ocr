/**
 * Utilities for working with Supabase queries
 * Ensures consistent field naming between client and server
 */

/**
 * Convert camelCase field names to snake_case for Supabase queries
 * @param params Object containing query parameters
 * @returns Object with keys converted to snake_case
 */
export function toSnakeCase(params: Record<string, any>): Record<string, any> {
  return Object.entries(params).reduce((result, [key, value]) => {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    result[snakeKey] = value;
    return result;
  }, {} as Record<string, any>);
}

/**
 * Convert snake_case field names to camelCase for client usage
 * @param data Object or array of objects from Supabase
 * @returns Data with keys converted to camelCase
 */
export function toCamelCase<T>(data: any): T {
  if (Array.isArray(data)) {
    return data.map(item => toCamelCaseObject(item)) as unknown as T;
  }
  
  return toCamelCaseObject(data) as T;
}

/**
 * Convert a single object's keys from snake_case to camelCase
 */
function toCamelCaseObject(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  
  return Object.entries(obj).reduce((result, [key, value]) => {
    // Convert snake_case to camelCase
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    // Handle nested objects and arrays
    if (value && typeof value === 'object') {
      result[camelKey] = Array.isArray(value)
        ? value.map(item => typeof item === 'object' ? toCamelCaseObject(item) : item)
        : toCamelCaseObject(value);
    } else {
      result[camelKey] = value;
    }
    
    return result;
  }, {} as Record<string, any>);
}

/**
 * Create a query helper for Supabase that handles field name conversion
 * @param supabaseClient The Supabase client instance
 * @returns Object with methods for querying with automatic field conversion
 */
export function createQueryHelper(supabaseClient: any) {
  return {
    /**
     * Get rows from a table with field name conversion
     */
    async select<T>(table: string, query: Record<string, any> = {}): Promise<T[]> {
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .match(toSnakeCase(query));
        
      if (error) throw error;
      return toCamelCase<T[]>(data || []);
    },
    
    /**
     * Get a single row by ID with field name conversion
     */
    async getById<T>(table: string, id: string, idField = 'id'): Promise<T | null> {
      const query = { [idField]: id };
      const snakeCaseQuery = toSnakeCase(query);
      
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .match(snakeCaseQuery)
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      
      return data ? toCamelCase<T>(data) : null;
    }
  };
} 