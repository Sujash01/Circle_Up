import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';
import { SpiralBinding } from './SpiralBinding';

/** Static paper layer for pinned journal photos and notes. */
export function NotebookPage({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('notebook-page', className)}><SpiralBinding />{children}</div>;
}
