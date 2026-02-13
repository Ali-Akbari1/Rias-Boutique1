import { useMemo } from "react";
import { ExternalLink, Instagram, Play } from "lucide-react";
import { getInstagramCards, getInstagramProfileUrl } from "@/data/store";
import { Button } from "@/components/ui/button";

const parseInstagramHandle = (profileUrl: string) => {
  try {
    const url = new URL(profileUrl);
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    return firstPath ? `@${firstPath}` : "@instagram";
  } catch {
    return "@instagram";
  }
};

const InstagramSection = () => {
  const profileUrl = getInstagramProfileUrl();
  const handle = parseInstagramHandle(profileUrl);
  const cards = useMemo(() => getInstagramCards(), []);

  return (
    <section id="instagram" className="bg-background py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="rounded-xl border border-border bg-card/30 p-5 sm:p-8">
          <div className="mb-8 flex flex-col gap-5 border-b border-border pb-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Social Gallery</p>
              <h2 className="text-3xl font-display font-bold text-foreground sm:text-4xl">Instagram Highlights</h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Fresh looks, reels, and boutique moments from {handle}. Open any card to view the original post.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Button asChild className="h-11 px-6 text-base font-semibold">
                <a href={profileUrl} target="_blank" rel="noreferrer">
                  <Instagram className="h-4 w-4" />
                  View Profile
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">Follow for new arrivals and styling videos</p>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="rounded-md border border-border bg-background/70 p-6 text-center">
              <p className="font-display text-xl text-foreground">Add Instagram cards to start</p>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Set <code>VITE_INSTAGRAM_CARDS</code> in your <code>.env</code> as
                <br />
                <code>postUrl|thumbnailUrl|label</code> entries separated by commas.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card, index) => (
                <article
                  key={card.id}
                  className="group overflow-hidden rounded-lg border border-border bg-background shadow-boutique transition-transform duration-300 hover:-translate-y-1 hover:shadow-card-hover"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                    <img
                      src={card.thumbnailUrl}
                      alt={card.label || `Instagram post ${index + 1}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src = "/placeholder.svg";
                      }}
                    />
                    {card.isReel && (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white">
                        <Play className="h-3 w-3 fill-current" />
                        Reel
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-border bg-background px-4 py-3">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{card.label || handle}</p>
                    <a
                      href={card.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Open on Instagram
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default InstagramSection;
