import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  currentFile?: string;
  accept?: string;
  maxSize?: number; // in MB
}

export function FileUpload({ 
  onFileSelect, 
  currentFile, 
  accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg",
  maxSize = 50 
}: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.size > maxSize * 1024 * 1024) {
        alert(`ファイルサイズは${maxSize}MB以下にしてください`);
        return;
      }
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [maxSize, onFileSelect]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > maxSize * 1024 * 1024) {
        alert(`ファイルサイズは${maxSize}MB以下にしてください`);
        return;
      }
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [maxSize, onFileSelect]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    onFileSelect(null);
  }, [onFileSelect]);

  const displayFile = selectedFile || (currentFile ? { name: currentFile } : null);

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        {displayFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <FileText className="h-8 w-8 text-blue-500" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {displayFile.name}
              </span>
            </div>
            <div className="flex justify-center space-x-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById("file-upload")?.click();
                }}
              >
                <Upload className="h-4 w-4 mr-1" />
                変更
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile();
                }}
              >
                <X className="h-4 w-4 mr-1" />
                削除
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <p className="text-sm text-gray-600">
                ファイルをドラッグ&ドロップするか、クリックして選択
              </p>
              <p className="text-xs text-gray-500 mt-1">
                最大{maxSize}MB、対応形式: PDF, Word, Excel, PowerPoint, 画像など
              </p>
            </div>
          </div>
        )}
      </div>
      
      <input
        id="file-upload"
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}