import styles from "@/components/artist/artist-figma.module.css";
import { ArtistHome } from "@/components/artist-home";

export default function ArtistPage() {
  return <div className={styles.homeScreen}><ArtistHome /></div>;
}
