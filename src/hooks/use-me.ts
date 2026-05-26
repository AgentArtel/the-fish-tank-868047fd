import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/cms.functions";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(),
    staleTime: 30_000,
  });
}
