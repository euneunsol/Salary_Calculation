import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Holiday } from '../../types/database.types';

export function useHolidays(from: string, to: string) {
  return useQuery({
    queryKey: ['holidays', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('*').gte('holiday_date', from).lte('holiday_date', to).order('holiday_date');
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });
}
