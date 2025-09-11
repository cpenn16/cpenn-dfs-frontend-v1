// src/components/LastUpdatedBadge.jsx
import React from "react";
import useLastUpdated from "../utils/useLastUpdated";

export default function LastUpdatedBadge({ source, metaUrl, prefix = "Updated:" }) {
  const { text } = useLastUpdated({ source, metaUrl });
  if (!text) return null;
  return (
    <span className="text-sm text-gray-500">
      {prefix} {text}
    </span>
  );
}
