import type { Metadata } from 'next';
import BookLibrary from '../../../components/books/BookLibrary';
import Navbar from '../../../components/shared/Navbar';
import Footer from '../../../components/shared/Footer';
import styles from '../../../components/books/BookLibrary.module.css';

export const metadata: Metadata = {
  title: 'Your Book Library | WebMangal',
  robots: { index: false, follow: false },
};

export default function BookLibraryPage() {
  return <div className={styles.page}>
    <Navbar variant="custom" platformName="WebMangal" logoSrc="/webmangal-logo.png" href="/WebMangal" subtitle="powered by MANGAL" />
    <BookLibrary />
    <Footer />
  </div>;
}