import { VideoEditor } from "@/components/editor/video-editor";
import { useParams } from "wouter";

export default function VideoEditorPage() {
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId ? parseInt(params.projectId, 10) : undefined;
  
  return <VideoEditor projectId={projectId} />;
}
