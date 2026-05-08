import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { getAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, NoteAnnotation } from '../../lib/api'
import Button from '../ui/Button'

interface AnnotatedNotesProps {
  moduleId: number
  content: string
}

export default function AnnotatedNotes({ moduleId, content }: AnnotatedNotesProps) {
  const [annotations, setAnnotations] = useState<NoteAnnotation[]>([])
  const [popover, setPopover] = useState<{
    x: number
    y: number
    type: 'create' | 'view' | 'edit'
    annId?: number
    selectedText?: string
    charOffset?: number
  } | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAnnotations(moduleId)
      .then(data => setAnnotations(data.annotations))
      .catch(console.error)
  }, [moduleId])

  // Pre-pass: inject highlights
  let processedContent = content
  
  // Sort annotations by char_offset descending so replacements don't shift offsets for earlier items
  const sortedAnnotations = [...annotations].sort((a, b) => b.char_offset - a.char_offset)

  for (const ann of sortedAnnotations) {
    const indices: number[] = []
    let i = processedContent.indexOf(ann.selected_text)
    while (i !== -1) {
      indices.push(i)
      i = processedContent.indexOf(ann.selected_text, i + 1)
    }
    
    if (indices.length > 0) {
      const closestIdx = indices.reduce((prev, curr) => 
        Math.abs(curr - ann.char_offset) < Math.abs(prev - ann.char_offset) ? curr : prev
      )
      
      const before = processedContent.slice(0, closestIdx)
      const after = processedContent.slice(closestIdx + ann.selected_text.length)
      const marker = `[${ann.selected_text}](#ann-${ann.id})`
      processedContent = before + marker + after
    }
  }

  // Handle Selection
  const handleMouseUp = () => {
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      if (containerRef.current && containerRef.current.contains(selection.anchorNode)) {
        const text = selection.toString().trim()
        if (text) {
          const range = selection.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          
          const charOffset = content.indexOf(text)
          
          setPopover({
            x: rect.left + (rect.width / 2),
            y: rect.top - 10,
            type: 'create',
            selectedText: text,
            charOffset: charOffset !== -1 ? charOffset : 0
          })
          setCommentInput('')
        }
      }
    }, 10)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as Element).closest('.annotation-popover')) return
      if ((e.target as Element).closest('mark')) return

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreate = async () => {
    if (!popover || popover.type !== 'create' || !popover.selectedText || !commentInput.trim()) return
    setIsSaving(true)
    try {
      const res = await createAnnotation(moduleId, {
        selected_text: popover.selectedText,
        comment: commentInput.trim(),
        char_offset: popover.charOffset ?? 0
      })
      if ('annotation' in res) {
        setAnnotations(prev => [...prev, res.annotation])
        setPopover(null)
        window.getSelection()?.removeAllRanges()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdate = async (annId: number, newComment: string) => {
    try {
      const res = await updateAnnotation(moduleId, annId, newComment)
      if ('annotation' in res) {
        setAnnotations(prev => prev.map(a => a.id === annId ? res.annotation : a))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async (annId: number) => {
    try {
      await deleteAnnotation(moduleId, annId)
      setAnnotations(prev => prev.filter(a => a.id !== annId))
      setPopover(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkClick = (annId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const ann = annotations.find(a => a.id === annId)
    if (ann) {
      setPopover({
        x: rect.left + (rect.width / 2),
        y: rect.top - 10,
        type: 'view',
        annId: ann.id
      })
      setCommentInput(ann.comment)
      // Clear selection so the popover doesn't disappear immediately
      window.getSelection()?.removeAllRanges()
    }
  }

  return (
    <>
      <div 
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="prose-output text-text-primary text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-text-secondary [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-text-primary [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('#ann-')) {
                const annId = Number(href.split('-')[1])
                return (
                  <mark 
                    data-ann-id={annId}
                    onClick={(e) => handleMarkClick(annId, e)}
                    className="bg-accent/15 text-inherit cursor-pointer rounded px-0.5 underline decoration-accent/50 hover:bg-accent/25 transition-colors"
                  >
                    {children}
                  </mark>
                )
              }
              return <a href={href ?? undefined}>{children}</a>
            },
            h3({ children, ...props }) {
              const text = String(children)
              const isAiNote = text.startsWith('[AI Note]')
              if (isAiNote) {
                return (
                  <h3 {...props} className="text-sm font-medium mt-3 mb-1 flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-sm uppercase tracking-widest shrink-0">AI Note</span>
                    <span className="text-amber-300">{text.replace('[AI Note]', '').trim()}</span>
                  </h3>
                )
              }
              return <h3 {...props}>{children}</h3>
            }
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {popover && (
        <div 
          className="annotation-popover fixed z-50 bg-bg-surface border border-border-default rounded-lg shadow-lg p-3 flex flex-col gap-2 w-64 transform -translate-x-1/2 -translate-y-full max-h-72 overflow-y-auto"
          style={{ left: popover.x, top: popover.y }}
        >
          {popover.type === 'create' ? (
            <>
              <p className="text-xs font-mono text-text-muted uppercase tracking-widest">Add Comment</p>
              <textarea
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                autoFocus
                placeholder="Type a comment..."
                rows={2}
                className="w-full text-sm bg-bg-subtle border border-border-default rounded p-2 focus:outline-none focus:border-border-strong resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="primary" size="sm" onClick={handleCreate} disabled={!commentInput.trim() || isSaving}>
                  Save
                </Button>
              </div>
            </>
          ) : popover.type === 'view' ? (
            <>
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-mono text-text-muted uppercase tracking-widest pt-1">Comment</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPopover({ ...popover, type: 'edit' })}
                    className="text-text-muted hover:text-accent transition-colors text-xs"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => popover.annId && handleDelete(popover.annId)}
                    className="text-text-muted hover:text-error transition-colors text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap max-h-32 overflow-y-auto">{commentInput}</p>
            </>
          ) : (
             <>
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-mono text-text-muted uppercase tracking-widest pt-1">Edit Comment</p>
              </div>
              <textarea
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                autoFocus
                placeholder="Type a comment..."
                rows={2}
                className="w-full text-sm bg-bg-subtle border border-border-default rounded p-2 focus:outline-none focus:border-border-strong resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="primary" size="sm" onClick={() => {
                  if (popover.annId && commentInput.trim()) {
                    handleUpdate(popover.annId, commentInput.trim())
                    setPopover({ ...popover, type: 'view' })
                  }
                }} disabled={!commentInput.trim()}>
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
