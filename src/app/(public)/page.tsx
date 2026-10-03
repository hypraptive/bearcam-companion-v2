// Server Component — no 'use client' directive
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gallery — BearCam Companion',
};

export default function GalleryPage(): React.JSX.Element {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">BearCam Companion</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The gallery is coming soon. Check back after image ingestion is set up.
      </p>
    </div>
  );
}
