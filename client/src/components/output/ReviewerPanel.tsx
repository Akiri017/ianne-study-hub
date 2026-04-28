import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import Button from '../ui/Button'
import SectionLabel from '../ui/SectionLabel'
import { getReviewer } from '../../lib/api'

interface ReviewerPanelProps {
  subjectId: number
}

export default function ReviewerPanel({ subjectId }: ReviewerPanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReviewer(subjectId)
      setContent(data.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reviewer.')
    } finally {
      setLoading(false)
    }
  }

  if (!content && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-6 py-12 px-8">
        <div className="text-center flex flex-col gap-2 max-w-md">
          <SectionLabel className="mb-1">SUBJECT REVIEWER</SectionLabel>
          <p className="text-text-secondary text-sm leading-relaxed">
            Generate a study reviewer from your weak points logged across all modules in this subject.
          </p>
        </div>

        {error && (
          <p className="text-error text-xs font-mono text-center">{error}</p>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={handleGenerate}
          className="w-full max-w-xs font-mono tracking-widest"
        >
          Generate Reviewer
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <SectionLabel>SUBJECT REVIEWER</SectionLabel>
          <span className="font-mono text-xs text-accent animate-pulse tracking-widest">
            GENERATING (May take up to 30s)…
          </span>
        </div>
        <div className="text-text-primary text-sm font-mono whitespace-pre-wrap leading-relaxed min-h-[200px]">
          <span className="animate-pulse text-accent">▋</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <SectionLabel>SUBJECT REVIEWER</SectionLabel>
        <Button variant="secondary" size="sm" onClick={handleGenerate}>
          Regenerate
        </Button>
      </div>

      <div className="prose-output text-text-primary text-sm leading-relaxed [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-text-secondary [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-text-primary [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary">
        <ReactMarkdown>{content!}</ReactMarkdown>
      </div>
    </div>
  )
}
