import sharp from "sharp";

export interface ProcessOptions {
  /** Max long-edge pixels when not cropping to a format. Default: 1920 */
  maxSize?: number;
  /** JPEG output quality 1-100. Default: 85 */
  quality?: number;
  /** Subtle brightness + saturation lift. Default: false */
  enhance?: boolean;
  /** Crop and resize to an exact Instagram format using attention-based smart crop */
  cropFormat?: "feed" | "stories" | "reels_cover";
  /**
   * Manual rotation in degrees CW applied AFTER EXIF auto-rotate.
   * Use when pixel data is stored sideways without EXIF orientation flag.
   * Values: 90 | 180 | 270
   */
  rotate?: 90 | 180 | 270;
}

const FORMAT_PX: Record<string, [number, number]> = {
  feed:        [1080, 1350],
  stories:     [1080, 1920],
  reels_cover: [1080, 1920],
};

/**
 * Process a photo buffer:
 * 1. Auto-rotate based on EXIF orientation (fixes sideways/upside-down photos)
 * 2. Resize / smart-crop to target dimensions
 * 3. Optional brightness + saturation enhancement
 * 4. Output as progressive JPEG
 */
export async function processPhoto(
  input: Buffer,
  options: ProcessOptions = {}
): Promise<Buffer> {
  const {
    maxSize    = 1920,
    quality    = 85,
    enhance    = false,
    cropFormat,
    rotate,
  } = options;

  // Start pipeline — .rotate() with no args reads EXIF and corrects orientation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pipeline: any = sharp(input).rotate(); // auto EXIF

  // Manual rotation for photos without EXIF orientation data
  if (rotate) {
    pipeline = pipeline.rotate(rotate);
  }

  if (cropFormat && FORMAT_PX[cropFormat]) {
    const [w, h] = FORMAT_PX[cropFormat];
    pipeline = pipeline.resize(w, h, {
      fit:      "cover",
      position: "attention", // smart crop — finds visually interesting region
    });
  } else {
    pipeline = pipeline.resize(maxSize, maxSize, {
      fit:              "inside",
      withoutEnlargement: true,
    });
  }

  if (enhance) {
    pipeline = pipeline
      .modulate({ brightness: 1.05, saturation: 1.15 })
      .sharpen({ sigma: 0.5 });
  }

  return (pipeline.jpeg({ quality, progressive: true }) as ReturnType<typeof sharp>).toBuffer();
}

/**
 * Fetch a photo from any public URL and return its Buffer.
 * Works for photos in external R2 buckets (e.g. imported photos).
 */
export async function fetchRemotePhoto(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
