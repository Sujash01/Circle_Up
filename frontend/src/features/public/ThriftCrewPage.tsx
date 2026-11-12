import { useState, type ChangeEvent, type FormEvent } from 'react';
import { communityService } from '@/services/communityServices';
import type { CommunitySubmission } from '@/types/storefront';

export function ThriftCrewPage() {
  const samplePosts = communityService.getSamplePosts();
  const [localPosts, setLocalPosts] = useState<CommunitySubmission[]>(() =>
    communityService.getLocalSubmissions(),
  );

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [caption, setCaption] = useState('');
  const [taggedPiece, setTaggedPiece] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) {
      setPreviewDataUrl('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      setError('Please choose an image under 2.5 MB so browser preview storage succeeds.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');

    if (displayName.trim().length < 2) {
      setError('Please enter your name or display name.');
      return;
    }
    if (caption.trim().length < 5) {
      setError('Please write a short caption (at least 5 characters).');
      return;
    }
    if (!previewDataUrl) {
      setError('Please select a photo for your local look preview.');
      return;
    }
    if (!consentChecked) {
      setError('Please confirm photo usage consent before submitting.');
      return;
    }

    const result = communityService.submitPost({
      displayName,
      handle: handle || displayName.toLowerCase().replace(/\s+/g, '.'),
      caption,
      image: previewDataUrl,
      taggedPiece,
    });

    setLocalPosts(communityService.getLocalSubmissions());
    setDisplayName('');
    setHandle('');
    setCaption('');
    setTaggedPiece('');
    setPreviewDataUrl('');
    setConsentChecked(false);
    setStatusMessage(
      result.savedToStorage
        ? 'Your look has been saved as a browser-local preview (not uploaded or published publicly).'
        : 'Preview created, though browser LocalStorage quota was full — clearing older previews may be required.',
    );
  };

  return (
    <div className="space-y-14">
      <header className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-end border-b border-foreground/15 pb-7">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] text-terracotta">
            Community Showcase
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl text-cocoa">#ThriftCrew</h1>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          How our community styles pre-loved pieces in the wild. Sample gallery below, plus a
          browser-only local submission preview tool.
        </p>
      </header>

      {/* Local browser submissions (distinct from sample gallery) */}
      {localPosts.length > 0 && (
        <section className="space-y-5 border-b border-foreground/15 pb-10">
          <div>
            <h2 className="font-display text-2xl text-cocoa">
              Your Local Browser Submissions (Preview Only)
            </h2>
            <p className="text-xs text-terracotta">
              Stored strictly in this browser&apos;s LocalStorage — not uploaded to a server or
              published publicly.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
            {localPosts.map((post) => (
              <figure key={post.id} className="space-y-3">
                <div className="overflow-hidden bg-[#ece6d2]">
                  <img
                    src={post.image}
                    alt={post.caption}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
                <figcaption className="space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-cocoa">
                      {post.displayName} ({post.handle})
                    </span>
                    <span className="uppercase tracking-wider text-primary">Local Preview</span>
                  </div>
                  <p className="text-sm text-foreground/85">{post.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Sample Community Gallery */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-cocoa">Sample #ThriftCrew Gallery</h2>
          <span className="text-xs text-terracotta">Sample lookbook content</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {samplePosts.map((post, idx) => (
            <figure key={post.id} className="space-y-3">
              <div className="overflow-hidden bg-[#ece6d2]">
                <img
                  src={post.image}
                  alt={post.caption}
                  loading="lazy"
                  className={
                    idx % 2 === 1
                      ? 'aspect-square w-full object-cover object-top'
                      : 'aspect-[4/5] w-full object-cover object-top'
                  }
                />
              </div>
              <figcaption className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-cocoa">{post.displayName}</span>
                  <span className="text-terracotta">{post.handle}</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/85">{post.caption}</p>
                {post.taggedPiece && (
                  <p className="text-xs italic text-steel">Styled with: {post.taggedPiece}</p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Browser-local photo submission form */}
      <section className="border-t border-foreground/15 pt-10 max-w-2xl">
        <h2 className="font-display text-3xl text-cocoa">Share Your Thrift Fit (Local Preview)</h2>
        <p className="mt-2 text-xs text-terracotta">
          Photos stay inside your browser using a local preview — nothing is uploaded to a server
          or published to other visitors.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5 bg-card/85 border border-foreground/15 p-6 sm:p-8">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="crew-name" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Name / Display Name
              </label>
              <input
                id="crew-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="crew-handle" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
                Social Handle (Optional)
              </label>
              <input
                id="crew-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@yourhandle"
                className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="crew-photo" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1.5">
              Select Photo (Local Browser Preview Only)
            </label>
            <input
              id="crew-photo"
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="block w-full text-xs text-cocoa file:mr-4 file:border file:border-foreground/30 file:bg-secondary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-cocoa hover:file:border-primary"
            />
            {previewDataUrl && (
              <div className="mt-3 w-36 overflow-hidden border border-foreground/20">
                <img src={previewDataUrl} alt="Local upload preview" className="aspect-[4/5] w-full object-cover" />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="crew-caption" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Caption
            </label>
            <textarea
              id="crew-caption"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              required
              placeholder="Tell us how you styled your thrifted piece..."
              className="w-full border border-foreground/25 bg-transparent p-3 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="crew-piece" className="block text-xs font-semibold uppercase tracking-wider text-cocoa mb-1">
              Featured Piece (Optional)
            </label>
            <input
              id="crew-piece"
              type="text"
              value={taggedPiece}
              onChange={(e) => setTaggedPiece(e.target.value)}
              placeholder="e.g. Vintage Denim Jacket"
              className="w-full border-b border-foreground/30 bg-transparent py-2 text-sm text-cocoa focus:border-primary focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-cocoa cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              I confirm this is my photo and grant simulated permission to display it inside this
              local #ThriftCrew preview.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="bg-primary px-7 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:bg-forest-deep transition-colors"
          >
            Preview #ThriftCrew Submission
          </button>

          {statusMessage && (
            <p className="text-xs font-medium text-primary">{statusMessage}</p>
          )}
        </form>
      </section>
    </div>
  );
}

