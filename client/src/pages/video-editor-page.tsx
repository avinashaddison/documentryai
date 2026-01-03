import { VideoEditor } from "@/components/editor/video-editor";
import { useParams, useSearch } from "wouter";

export default function VideoEditorPage() {
  const params = useParams<{ projectId?: string }>();
  const searchString = useSearch();
  
  // Support both path params (/video-editor/7) and query params (?project=7)
  let projectId: number | undefined;
  
  if (params.projectId) {
    projectId = parseInt(params.projectId, 10);
  } else if (searchString) {
    const searchParams = new URLSearchParams(searchString);
    const projectParam = searchParams.get("project");
    if (projectParam) {
      projectId = parseInt(projectParam, 10);
    }
  }
  
  return <VideoEditor projectId={projectId} />;
}
