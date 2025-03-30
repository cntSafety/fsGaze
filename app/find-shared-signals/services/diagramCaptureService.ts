import { CCIFlowDiagramHandle } from "../components/CCIFlowDiagram";

export const captureDiagramAsPng = async (
  diagramRef: React.RefObject<CCIFlowDiagramHandle>,
): Promise<void> => {
  if (!diagramRef.current) {
    throw new Error("Diagram reference is not available");
  }

  try {
    // Use the toImage method exposed through the ref
    const dataUrl = await diagramRef.current.toImage({
      quality: 1,
      type: "image/png",
      backgroundColor: "#ffffff",
    });

    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `cci-analysis-${timestamp}.png`;

    // Create a download link and trigger download using browser APIs
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(dataUrl);
    }, 100);
  } catch (error) {
    console.error("Error capturing diagram:", error);
    throw error;
  }
};
