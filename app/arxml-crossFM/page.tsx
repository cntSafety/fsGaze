import Link from 'next/link';
import CrossComponentFailureChain from './components/CrossComponentFailureChain';
import CrossCompFlow from './components/CrossCompFlow';

export default function ArxmlCrossFMPage() {
  return (
    <div className="container mx-auto">
      {/* <CrossComponentFailureChain /> */} 
      <div className="mb-6">
        <Link 
          href="/arxml-crossFM/safety-tree" 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-block"
        >
          View Safety Tree
        </Link>
      </div>
      <CrossCompFlow />
    </div>
  );
} 