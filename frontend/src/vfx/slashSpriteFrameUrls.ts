export type SlashSpritePreset = 'slash1' | 'slash2' | 'slash3';

function sortedPngUrls(modules: Record<string, string>): string[] {
  return Object.keys(modules)
    .sort((a, b) => {
      const ma = a.match(/frame(\d+)/i);
      const mb = b.match(/frame(\d+)/i);
      const na = ma ? parseInt(ma[1]!, 10) : 0;
      const nb = mb ? parseInt(mb[1]!, 10) : 0;
      return na - nb;
    })
    .map((k) => modules[k]!);
}

const slash1 = sortedPngUrls(
  import.meta.glob('../assets/vfx/Slash 1/color4/Frames/*.png', { eager: true, import: 'default' }) as Record<
    string,
    string
  >,
);
const slash2 = sortedPngUrls(
  import.meta.glob('../assets/vfx/Slash 2/color4/Frames/*.png', { eager: true, import: 'default' }) as Record<
    string,
    string
  >,
);
const slash3 = sortedPngUrls(
  import.meta.glob('../assets/vfx/Slash 3/color4/frames/*.png', { eager: true, import: 'default' }) as Record<
    string,
    string
  >,
);

export const SLASH_SPRITE_FRAME_URLS: Record<SlashSpritePreset, string[]> = {
  slash1: slash1,
  slash2: slash2,
  slash3: slash3,
};
