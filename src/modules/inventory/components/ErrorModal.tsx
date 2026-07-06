'use client';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export function ErrorModal({ isOpen, onClose, title = "Action Failed", message }: ErrorModalProps) {
  if (!isOpen) return null;

  // Enhance common errors with human-friendly explanations
  let friendlyExplanation = "";
  if (message.toLowerCase().includes("resource_unavailable") || message.toLowerCase().includes("placement")) {
    friendlyExplanation = "This instance size is temporarily out of stock in the selected region. Please try again in a few minutes, or select a different server type.";
  } else if (message.toLowerCase().includes("unauthorized") || message.includes("401")) {
    friendlyExplanation = "API token is invalid or has expired. Please check your credentials.";
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200 text-left">
        <div className="p-6 space-y-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1.5 flex-1">
              <h3 className="text-xl font-bold text-slate-900">{title}</h3>
              <div className="text-xs text-slate-650 font-mono bg-slate-50 p-3 rounded-lg border border-slate-100 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
                {message}
              </div>
              {friendlyExplanation && (
                <div className="text-xs font-semibold text-rose-700 mt-2 bg-rose-50 border border-rose-200/50 p-2.5 rounded-lg leading-normal">
                  💡 {friendlyExplanation}
                </div>
              )}
            </div>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
