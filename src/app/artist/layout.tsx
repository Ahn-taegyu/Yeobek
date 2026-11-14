import "@/components/artist/artist.css";

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return <div className="artist-screen">{children}</div>;
}
