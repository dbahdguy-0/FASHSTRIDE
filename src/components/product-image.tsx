'use client';
import { useEffect, useState } from 'react';

const FALLBACK_IMAGE = '/images/sneaker-placeholder.svg';
type ProductImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null };

/** Keeps remote or storage image failures from appearing as broken-image icons. */
export function ProductImage({ src, alt, onError, ...props }: ProductImageProps) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_IMAGE);
  useEffect(() => setImageSrc(src || FALLBACK_IMAGE), [src]);
  return <img {...props} src={imageSrc} alt={alt || ''} onError={(event) => {
    onError?.(event);
    if (imageSrc !== FALLBACK_IMAGE) setImageSrc(FALLBACK_IMAGE);
  }} />;
}
