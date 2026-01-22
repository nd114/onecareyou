import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
                <Heart className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold">Marpe</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Your intelligent medication tracker. Manage your health safely with real-time interaction warnings.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground transition-colors">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              <li><Link to="/about" className="hover:text-foreground transition-colors">About</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/help" className="hover:text-foreground transition-colors">Help Center</Link></li>
              <li><Link to="/contact" className="hover:text-foreground transition-colors">Contact Us</Link></li>
              <li><a href="mailto:support@onecare.app" className="hover:text-foreground transition-colors">support@onecare.app</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              <li><Link to="/disclaimer" className="hover:text-foreground transition-colors">Medical Disclaimer</Link></li>
              <li><Link to="/data-processing" className="hover:text-foreground transition-colors">Data Processing</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/help" className="hover:text-foreground transition-colors">Getting Started</Link></li>
              <li><Link to="/features" className="hover:text-foreground transition-colors">How It Works</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">Compare Plans</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Marpe. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground text-center md:text-right max-w-lg">
            Marpe is not a substitute for professional medical advice. Always consult your healthcare provider.
            <Link to="/disclaimer" className="ml-1 underline hover:text-foreground">
              Read our Medical Disclaimer
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
