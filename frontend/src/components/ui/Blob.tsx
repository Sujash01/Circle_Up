import type { ImgHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BlobPreset } from '@/lib/blobs';

interface BlobProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'className' | 'src' | 'alt'> {
  src?: string;
  alt: string;
  shape?: BlobPreset;
  className?: string;
  imageClassName?: string;
  outline?: boolean;
  children?: ReactNode;
}

export function Blob({
  src,
  alt,
  shape = 'pebble',
  className,
  imageClassName,
  outline = false,
  children,
  loading = 'lazy',
  decoding = 'async',
  ...imageProps
}: BlobProps) {
  return (
    <figure className={cn('blob-frame', `shape-${shape}`, outline && 'shape-outline', className)}>
      {src ? (
        <img
          {...imageProps}
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          className={cn('blob-image', imageClassName)}
        />
      ) : (
        <span aria-hidden="true" className="blob-placeholder" />
      )}
      {children}
    </figure>
  );
}
