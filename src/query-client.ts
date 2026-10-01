import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { CHAT_CACHE_MAX_AGE } from "@/storage/query-persistence";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: CHAT_CACHE_MAX_AGE,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
