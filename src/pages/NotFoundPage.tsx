import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-5xl font-semibold text-primary">404</p>
        <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you’re looking for doesn’t exist.</p>
        <Link to="/" className="mt-4 inline-block font-medium text-primary hover:text-primary-hover">Back to home</Link>
      </div>
    </div>
  );
}
