<script lang="ts">
  import { faceOf } from './lib/face'
  let { id, color, year = 1, size = 'md' }: { id: number; color: string; year?: number; size?: 'sm' | 'md' | 'lg' } = $props()
  const px = $derived(faceOf(id, color, year))
</script>

<svg class="face {size}" style="--c:{color}" viewBox="0.5 0 11 12" shape-rendering="crispEdges" aria-hidden="true">
  {#each px as r}<rect x={r.x} y={r.y} width={r.w} height="1" fill={r.f} />{/each}
</svg>
