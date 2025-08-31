import { Link } from "react-router-dom";
import { Twitter, Youtube, Instagram, Mail } from "lucide-react";

export default function TopBar() {
  return (
    <div className="w-full bg-white border-b">
      <div className="max-w-6xl mx-auto h-12 px-4 flex items-center justify-between text-sm">
        <div className="hidden md:flex items-center gap-6 text-gray-700">
          <Link to="/join" className="hover:text-blue-800">Join Now</Link>
          <Link to="/news" className="hover:text-blue-800">News</Link>
          <Link to="/about" className="hover:text-blue-800">About</Link>
          <Link to="/contact" className="hover:text-blue-800">Contact</Link>
        </div>

        <div className="flex items-center gap-4">
          <a href="#" aria-label="Twitter" className="text-gray-600 hover:text-blue-800"><Twitter className="w-5 h-5" /></a>
          <a href="#" aria-label="YouTube" className="text-gray-600 hover:text-red-600"><Youtube className="w-5 h-5" /></a>
          <a href="#" aria-label="Instagram" className="text-gray-600 hover:text-pink-600"><Instagram className="w-5 h-5" /></a>
          <a href="#" aria-label="Email" className="text-gray-600 hover:text-blue-800"><Mail className="w-5 h-5" /></a>

          <Link
            to="/login"
            className="ml-3 rounded-md border px-3 py-1.5 text-blue-900 border-blue-900 hover:bg-blue-50"
          >
            Login / Register
          </Link>
        </div>
      </div>
    </div>
  );
}
