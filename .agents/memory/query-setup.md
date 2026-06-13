---
name: Query setup quirk
description: TanStack Query has no global defaultQueryFn — every useQuery needs its own queryFn
---

## Rule
Every `useQuery()` call must include an explicit `queryFn`. There is no `defaultQueryFn` configured in `client/src/lib/queryClient.ts`.

## Why
The queryClient only configures `defaultOptions` (retry, staleTime, refetchOnWindowFocus). Without a `queryFn`, TanStack Query v5 throws "Missing queryFn for queryKey" at runtime.

## How to apply
```typescript
useQuery({
  queryKey: ['/api/some/endpoint'],
  queryFn: async () => {
    const res = await fetch('/api/some/endpoint', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    return res.json();
  },
});
```

Note: queries that use `enabled: false` by default (e.g., admin queries before user loads) won't error because they never run — but they'll still fail once enabled if queryFn is missing.
