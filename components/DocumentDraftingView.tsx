import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { RichTextEditor } from './RichTextEditor';
import { generateDocument } from '../services/geminiService';
import { transcribeAudioWithGemini } from '../services/geminiService';
import { saveDocumentDraft, getDocumentDrafts, deleteDocumentDraft } from '../services/documentDraftingStorageService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, UnderlineType, ShadingType, AlignmentType, ExternalHyperlink, IRunOptions } from 'docx';
import saveAs from 'file-saver';
import { marked } from 'marked';

interface DocumentDraftingViewProps {
  onBackToChat: () => void;
}

interface DocumentDraft {
  id: string;
  title: string;
  instructions: string;
  content: string;
  timestamp: number;
}

const MicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg className={`animate-spin ${className || "h-5 w-5 text-white"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Helper function to process HTML nodes for DOCX conversion
const processNodeForDocx = (node: Node, currentListFormat?: { level: number; type: 'bullet' | 'number' }): (Paragraph | null)[] => {
  const paragraphs: Paragraph[] = [];

  const getRunsForElement = (elementNode: HTMLElement, inheritedStyle: IRunOptions = {}): TextRun[] => {
    const runs: TextRun[] = [];

    const newElementStyle: IRunOptions = {
      ...( (elementNode.tagName === 'STRONG' || elementNode.tagName === 'B' || elementNode.style.fontWeight === 'bold' || parseInt(elementNode.style.fontWeight) >= 700) && { bold: true } ),
      ...( (elementNode.tagName === 'EM' || elementNode.tagName === 'I' || elementNode.style.fontStyle === 'italic') && { italics: true } ),
      ...( (elementNode.tagName === 'U' || elementNode.style.textDecorationLine?.includes('underline')) && { underline: { type: UnderlineType.SINGLE } } ),
      ...( (elementNode.tagName === 'S' || elementNode.tagName === 'STRIKE' || elementNode.style.textDecorationLine?.includes('line-through')) && { strike: true } ),
    };
    
    const effectiveStyleForContent = { ...inheritedStyle, ...newElementStyle };

    Array.from(elementNode.childNodes).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          runs.push(new TextRun({ text: child.textContent, ...effectiveStyleForContent }));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName === 'BR') {
          runs.push(new TextRun({ text: "", break: 1, ...effectiveStyleForContent }));
        } else {
          runs.push(...getRunsForElement(el, effectiveStyleForContent));
        }
      }
    });
    return runs;
  };

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    let paragraphChildren: TextRun[] = [];
    let currentHeadingLevel: typeof HeadingLevel[keyof typeof HeadingLevel] | undefined = undefined;
    let currentAlignmentType: typeof AlignmentType[keyof typeof AlignmentType] | undefined = undefined;

    switch (element.tagName) {
      case 'H1': currentHeadingLevel = HeadingLevel.HEADING_1; paragraphChildren = getRunsForElement(element); break;
      case 'H2': currentHeadingLevel = HeadingLevel.HEADING_2; paragraphChildren = getRunsForElement(element); break;
      case 'H3': currentHeadingLevel = HeadingLevel.HEADING_3; paragraphChildren = getRunsForElement(element); break;
      case 'P': paragraphChildren = getRunsForElement(element); break;
      case 'UL':
      case 'OL':
        Array.from(element.children).forEach(li => {
          if (li.tagName === 'LI') {
            const nestedParagraphs = processNodeForDocx(li, {
              level: currentListFormat ? currentListFormat.level + 1 : 0,
              type: element.tagName === 'UL' ? 'bullet' : 'number'
            });
            paragraphs.push(...nestedParagraphs.filter(p => p !== null) as Paragraph[]);
          }
        });
        return paragraphs; 
      case 'LI':
        paragraphChildren = getRunsForElement(element);
        break;
      case 'BLOCKQUOTE':
        paragraphChildren = getRunsForElement(element);
        break;
      case 'PRE': 
        paragraphChildren = getRunsForElement(element);
        paragraphs.push(new Paragraph({ 
          children: paragraphChildren, 
          shading: { type: ShadingType.SOLID, color: "auto", fill: "F1F1F1" },
          style: "CodeBlock" 
        }));
        return paragraphs; 
      default: 
        if (element.textContent?.trim()) {
          paragraphChildren = getRunsForElement(element);
        } else {
          return [null]; 
        }
    }

    if (paragraphChildren.length > 0 || currentHeadingLevel || (element.textContent || "").trim() === "" && (element.tagName === 'P' || element.tagName === 'LI')) {
      const paraProps: any = { children: paragraphChildren };
      if (currentHeadingLevel) paraProps.heading = currentHeadingLevel;
      if (currentAlignmentType) paraProps.alignment = currentAlignmentType;

      if (currentListFormat) {
        if (currentListFormat.type === 'bullet') {
          paraProps.bullet = { level: currentListFormat.level };
        } else {
          paraProps.numbering = { reference: 'default-numbering', level: currentListFormat.level };
        }
      }
      paragraphs.push(new Paragraph(paraProps));
    }
  } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
    paragraphs.push(new Paragraph({ children: [new TextRun(node.textContent)] }));
  }
  return paragraphs.length > 0 ? paragraphs : [null];
};

export const DocumentDraftingView: React.FC<DocumentDraftingViewProps> = ({ onBackToChat }) => {
  const [currentInstructions, setCurrentInstructions] = useState<string>('');
  const [currentContent, setCurrentContent] = useState<string>('');
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<DocumentDraft[]>([]);

  // Dictation state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [displayDuration, setDisplayDuration] = useState<number>(0);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordedMimeTypeRef = useRef<string | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Audio visualization refs (removed canvas-related refs)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const navigateToDocumentation = () => {
    window.open('/documentation', '_blank');
  };

  useEffect(() => {
    loadSavedDrafts();
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const loadSavedDrafts = () => {
    const drafts = getDocumentDrafts();
    setSavedDrafts(drafts);
  };

  const stopRecordingCleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    mediaRecorderRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceNodeRef.current = null;
    animationFrameIdRef.current = null;
    timerIntervalRef.current = null;
    recordingStartTimeRef.current = null;
  };

  const handleDictateClick = async () => {
    setError(null);
    setDictationError(null);

    if (isTranscribing) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        setDisplayDuration(0);
        
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
        sourceNodeRef.current.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;
        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        let tempRecordedMimeType: string | null = null;

        mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
        
        mediaRecorderRef.current.onstart = () => {
          if (mediaRecorderRef.current) {
            tempRecordedMimeType = mediaRecorderRef.current.mimeType;
            console.log("Recording started with MIME type:", tempRecordedMimeType);
          }
          recordingStartTimeRef.current = Date.now();
          timerIntervalRef.current = window.setInterval(() => {
            if (recordingStartTimeRef.current) {
              const currentDuration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
              setDisplayDuration(currentDuration);
            }
          }, 1000);
        };

        mediaRecorderRef.current.onstop = async () => {
          const finalDuration = Math.floor((Date.now() - (recordingStartTimeRef.current || Date.now())) / 1000);
          stopRecordingCleanup();
          setIsRecording(false);
          setIsTranscribing(true);
          setDisplayDuration(finalDuration);
          
          if (audioChunksRef.current.length === 0 || !tempRecordedMimeType) {
            setDictationError("No audio recorded.");
            setIsTranscribing(false);
            return;
          }

          const audioBlob = new Blob(audioChunksRef.current, { type: tempRecordedMimeType });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64AudioData = (reader.result as string)?.split(',')[1];
            if (!base64AudioData) {
              setDictationError("Failed to convert audio to base64.");
              setIsTranscribing(false);
              return;
            }
            try {
              const transcriptionResponse = await transcribeAudioWithGemini(base64AudioData, tempRecordedMimeType!);
              if (transcriptionResponse.text.startsWith("Error:")) {
                setDictationError(transcriptionResponse.text);
              } else {
                setCurrentInstructions((prev: string) => (prev ? prev + " " : "") + transcriptionResponse.text);
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : "Transcription failed.";
              setDictationError(`Transcription error: ${message}`);
            } finally {
              setIsTranscribing(false);
              audioChunksRef.current = [];
              recordedMimeTypeRef.current = null;
            }
          };
          reader.onerror = () => {
            setDictationError("Failed to read audio blob.");
            setIsTranscribing(false);
            audioChunksRef.current = [];
            recordedMimeTypeRef.current = null;
          };
        };
        
        mediaRecorderRef.current.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          setDictationError(`Recording error: ${(event as any).error?.name || 'Unknown recording error'}`);
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        recordedMimeTypeRef.current = tempRecordedMimeType;

      } catch (err) {
        console.error("Error accessing microphone:", err);
        setDictationError("Microphone access denied or microphone not found. Please check permissions.");
        setIsRecording(false);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerateDocument = async () => {
    if (!currentInstructions.trim()) {
      setError('Please provide instructions for document generation');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDictationError(null);

    try {
      const result = await generateDocument(currentInstructions);
      setCurrentContent(result);
      if (!currentTitle) {
        const firstLine = currentInstructions.split('\n')[0];
        setCurrentTitle(firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : ''));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while generating the document');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = () => {
    if (!currentInstructions.trim() && !currentContent.trim()) {
      setError('Please provide instructions or content to save');
      return;
    }

    const draft: DocumentDraft = {
      id: crypto.randomUUID(),
      title: currentTitle || 'Untitled Document',
      instructions: currentInstructions,
      content: currentContent,
      timestamp: Date.now(),
    };

    saveDocumentDraft(draft);
    loadSavedDrafts();
    alert('Draft saved successfully!');
  };

  const handleLoadDraft = (draft: DocumentDraft) => {
    setCurrentTitle(draft.title);
    setCurrentInstructions(draft.instructions);
    setCurrentContent(draft.content);
  };

  const handleDeleteDraft = (id: string) => {
    if (window.confirm('Are you sure you want to delete this draft?')) {
      deleteDocumentDraft(id);
      loadSavedDrafts();
    }
  };

  const handleStartNewDocument = () => {
    if (isLoading || isRecording || isTranscribing) return;
    
    if ((currentInstructions || currentContent) && !window.confirm('Starting a new document will clear your current work. Continue?')) {
      return;
    }
    
    setCurrentInstructions('');
    setCurrentContent('');
    setCurrentTitle('');
    setError(null);
    setDictationError(null);
  };

  const onInstructionsChange = (value: string) => {
    setCurrentInstructions(value);
  };

  const onContentChange = (value: string) => {
    setCurrentContent(value);
  };

  const onTitleChange = (value: string) => {
    setCurrentTitle(value);
  };

  const handleExportDOCX = async () => {
    if (!currentContent.trim()) return;

    setIsLoading(true);

    try {
      // Parse the Markdown content to HTML
      marked.setOptions({ gfm: true, breaks: true });
      const htmlContent = marked.parse(currentContent) as string;
      
      // Create a temporary div to parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      
      // Convert HTML nodes to DOCX paragraphs
      const docxElements: Paragraph[] = [];
      Array.from(tempDiv.childNodes).forEach(node => {
        const processed = processNodeForDocx(node);
        docxElements.push(...processed.filter(p => p !== null) as Paragraph[]);
      });

      // Ensure we have at least one paragraph
      if (docxElements.length === 0) {
        docxElements.push(new Paragraph({ text: "" }));
      }

      const doc = new Document({
        numbering: {
          config: [
            {
              reference: 'default-numbering',
              levels: [
                { level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 }}}},
                { level: 1, format: 'lowerLetter', text: '%2.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 }}}},
                { level: 2, format: 'lowerRoman', text: '%3.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 2160, hanging: 360 }}}},
              ],
            },
          ],
        },
        styles: { 
          default: {
            document: {
              run: {
                size: 36, // 18pt font size (18 * 2 = 36 half-points) - Above 16pt requirement
                font: "Times New Roman"
              },
              paragraph: {
                spacing: {
                  after: 240 // Add spacing after paragraphs for better readability
                }
              }
            }
          },
          paragraphStyles: [
            {
              id: "Heading1",
              name: "Heading 1",
              basedOn: "Normal",
              next: "Normal",
              run: {
                size: 56, // 28pt for H1 (28 * 2 = 56 half-points)
                bold: true,
                font: "Times New Roman"
              },
              paragraph: {
                spacing: {
                  before: 480, // Space before heading
                  after: 360   // Space after heading
                }
              }
            },
            {
              id: "Heading2", 
              name: "Heading 2",
              basedOn: "Normal",
              next: "Normal",
              run: {
                size: 48, // 24pt for H2 (24 * 2 = 48 half-points)
                bold: true,
                font: "Times New Roman"
              },
              paragraph: {
                spacing: {
                  before: 360,
                  after: 240
                }
              }
            },
            {
              id: "Heading3",
              name: "Heading 3", 
              basedOn: "Normal",
              next: "Normal",
              run: {
                size: 40, // 20pt for H3 (20 * 2 = 40 half-points)
                bold: true,
                font: "Times New Roman"
              },
              paragraph: {
                spacing: {
                  before: 240,
                  after: 120
                }
              }
            },
            {
              id: "CodeBlock",
              name: "Code Block",
              basedOn: "Normal",
              next: "Normal",
              run: {
                font: "Courier New",
                size: 28, // 14pt for code blocks (14 * 2 = 28 half-points)
              },
              paragraph: {
                shading: { type: ShadingType.SOLID, color: "auto", fill: "F1F1F1" },
                indent: { left: 720 },
                spacing: {
                  after: 240
                }
              }
            }
          ],
          characterStyles: [
            {
              id: "Hyperlink",
              name: "Hyperlink",
              basedOn: "DefaultParagraphFont",
              run: {
                color: "0563C1",
                underline: {
                  type: UnderlineType.SINGLE,
                  color: "0563C1"
                },
                size: 32 // 16pt for hyperlinks
              }
            }
          ]
        },
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
            },
          },
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: currentTitle || 'Legal Document', size: 56, bold: true })],
              spacing: {
                after: 360
              }
            }),
            new Paragraph({
              children: [new TextRun({ text: `Generated on: ${new Date().toLocaleDateString('en-IN', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}`, italics: true, size: 32 })],
              spacing: {
                after: 480
              }
            }),
            ...docxElements
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const sanitizedTitle = (currentTitle || 'document').replace(/[^a-zA-Z0-9]/g, '_');
      saveAs(blob, `${sanitizedTitle}.docx`);
    } catch (error) {
      console.error('Error exporting to DOCX:', error);
      setError('Failed to export to DOCX. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportTXT = () => {
    if (!currentContent.trim()) return;

    const blob = new Blob([currentContent], { type: 'text/plain;charset=utf-8' });
    const sanitizedTitle = (currentTitle || 'document').replace(/[^a-zA-Z0-9]/g, '_');
    saveAs(blob, `${sanitizedTitle}.txt`);
  };

  const isProcessing = isLoading || isRecording || isTranscribing;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900">
      <Header onNavigateToDocumentation={navigateToDocumentation} />
      <main className="flex-grow p-3 sm:p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-4 flex flex-col">
        
        {/* Header with controls */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-gray-100">
            Document Drafting
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleStartNewDocument}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              New Document
            </button>
            <button
              onClick={onBackToChat}
              className="px-3 py-1.5 text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              ← Back to Chat
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow min-h-0">
          {/* Saved Drafts Sidebar */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg h-fit max-h-[600px] overflow-y-auto">
            <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-3">Saved Drafts</h3>
            {savedDrafts.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">No saved drafts yet</p>
            ) : (
              <div className="space-y-2">
                {savedDrafts.map(draft => (
                  <div key={draft.id} className="p-2 bg-slate-50 dark:bg-slate-700 rounded-md">
                    <h4 className="font-medium text-sm text-slate-800 dark:text-white">{draft.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Date(draft.timestamp).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleLoadDraft(draft)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-4 flex flex-col min-h-0">
            {/* Section 1: Instructions Input */}
            <div className="space-y-3 p-3 sm:p-4 bg-white dark:bg-slate-800 shadow-lg rounded-lg animate-fade-in-slide-up">
              <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">1. Provide Document Instructions</h3>
              
              {/* Error Messages */}
              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-700/20 border border-red-300 dark:border-red-600/50 text-red-700 dark:text-red-300 rounded-md text-sm">
                  {error}
                </div>
              )}
              {dictationError && (
                <div className="p-3 bg-yellow-100 dark:bg-yellow-700/20 border border-yellow-300 dark:border-yellow-600/50 text-yellow-700 dark:text-yellow-300 rounded-md text-sm">
                  {dictationError}
                </div>
              )}

              {/* Recording status */}
              {(isRecording || isTranscribing) && (
                <div className="text-center">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {isRecording ? `Recording: ${formatTime(displayDuration)}` : 
                     isTranscribing ? 'Transcribing audio...' : ''}
                  </p>
                </div>
              )}

              <textarea
                value={currentInstructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder="Example: Draft a comprehensive employment contract for a software engineer position in India, including clauses for intellectual property, confidentiality, termination conditions, and compliance with Indian labor laws."
                className="w-full h-32 p-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 focus:ring-red-500 focus:border-red-500 text-sm"
                disabled={isProcessing}
              />

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={handleGenerateDocument}
                  disabled={isProcessing}
                  className="flex-grow sm:flex-grow-0 px-4 py-2 text-sm sm:text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center justify-center sm:min-w-[160px]"
                >
                  {isLoading ? (
                    <>
                      <SpinnerIcon className="-ml-1 mr-2 h-5 w-5 text-white" />
                      Generating...
                    </>
                  ) : (
                    'Generate Document'
                  )}
                </button>
                
                <button
                  onClick={handleDictateClick}
                  disabled={isLoading || isTranscribing}
                  className={`flex-grow sm:flex-grow-0 px-4 py-2 text-sm sm:text-base font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-opacity-50 flex items-center justify-center sm:min-w-[160px]
                    ${isRecording ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}
                    ${isTranscribing ? 'bg-gray-400 cursor-not-allowed' : ''}
                  `}
                >
                  {isTranscribing ? (
                    <>
                      <SpinnerIcon className="-ml-1 mr-2 h-5 w-5 text-white" />
                      Transcribing...
                    </>
                  ) : isRecording ? (
                    <>
                      <StopIcon className="-ml-1 mr-2 w-5 h-5" /> Stop Recording
                    </>
                  ) : (
                    <>
                      <MicIcon className="-ml-1 mr-2 w-5 h-5" /> Dictate
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Section 2: Document Editor */}
            <div className="space-y-3 p-3 sm:p-4 bg-white dark:bg-slate-800 shadow-lg rounded-lg flex-grow flex flex-col min-h-0 animate-fade-in-slide-up"> 
              <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">2. Edit & Export Document</h3>
              
              <div>
                <label htmlFor="documentTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document Title:
                </label>
                <input
                  type="text"
                  id="documentTitle"
                  value={currentTitle}
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 focus:ring-red-500 focus:border-red-500 text-sm"
                  placeholder="Enter document title"
                />
              </div>
              
              <div className="mb-3 space-y-2"> 
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-md font-medium text-slate-700 dark:text-slate-300">Actions:</h4>
                    <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={handleSaveDraft} 
                          disabled={isProcessing || (!currentInstructions.trim() && !currentContent.trim())} 
                          className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                          {isProcessing ? 'Processing...' : 'Save Draft'}
                        </button>
                        <button onClick={handleExportDOCX} disabled={isLoading || !currentContent.trim()} className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                            {isLoading && 'Processing...' || 'Export DOCX'}
                        </button>
                        <button onClick={handleExportTXT} disabled={isLoading || !currentContent.trim()} className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                             {isLoading && 'Processing...' || 'Export TXT'}
                        </button>
                    </div>
                </div>
              </div>

              <div className="flex-grow border border-slate-300 dark:border-slate-700 rounded-md"> 
                <RichTextEditor value={currentContent} onChange={onContentChange} placeholder="AI generated document will appear here. You can also start typing..." />
              </div>
            </div>
          </div>
        </div>
        
        {(isLoading || isTranscribing) && !error && !dictationError && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" aria-live="assertive" aria-atomic="true">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl flex items-center space-x-4">
                <SpinnerIcon className="h-8 w-8 text-red-500" />
                <span className="text-slate-700 dark:text-slate-300 text-lg">
                    {isLoading ? 'Generating document...' : 'Processing audio...'}
                </span>
            </div>
        </div>}

      </main>
      <Footer />
    </div>
  );
};