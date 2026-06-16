import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/cms.functions";

export function useMe() {
  const getMeFn = useServerFn(getMe);
  return useQuery({
    queryKey: ["me"],
    queryFn: () => getMeFn(),
    staleTime: 30_000,
  });
}
