import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Paperclip, Download, FileText } from 'lucide-react';

interface AttachmentDialogProps {
  attachmentUrl: string | null;
}

function parseUrls(attachmentUrl: string): string[] {
  try {
    const parsed = JSON.parse(attachmentUrl);
    return Array.isArray(parsed) ? parsed : [attachmentUrl];
  } catch {
    return [attachmentUrl];
  }
}

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url.split('/').pop() || 'Arquivo');
    // Remove UUID prefix if present (e.g. "abc123-filename.pdf" -> "filename.pdf")
    return decoded.replace(/^[0-9a-f]{8,}-/, '');
  } catch {
    return 'Arquivo';
  }
}

const AttachmentDialog: React.FC<AttachmentDialogProps> = ({ attachmentUrl }) => {
  const [open, setOpen] = useState(false);

  if (!attachmentUrl) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const urls = parseUrls(attachmentUrl);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <Paperclip className="h-3 w-3" />
        {urls.length} {urls.length === 1 ? 'anexo' : 'anexos'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Anexos ({urls.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{getFileName(url)}</p>
                  <p className="text-xs text-muted-foreground">Clique para baixar</p>
                </div>
                <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AttachmentDialog;
