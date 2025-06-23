import CrossComponentFailureChain from './components/CrossComponentFailureChain';
import SafetyTreeView from './components/SafetyTreeView';
import CrossCompFlow from './components/CrossCompFlow';

export default function ArxmlCrossFMPage() {
  return (
    <div className="container mx-auto">
      {/* <CrossComponentFailureChain />
      <SafetyTreeView /> */}
      <CrossCompFlow />
    </div>
  );
} 