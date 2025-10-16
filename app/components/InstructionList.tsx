// src/components/InstructionList.tsx
import DOMPurify from 'dompurify';
import { InstructionItem } from '../lib/parsing';

interface InstructionListProps {
  items: InstructionItem[];
}

export function InstructionList({ items }: InstructionListProps) {
  return (
    <div className="bg-white text-gray-800 border p-4 rounded-lg">
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="flex-shrink-0 bg-blue-100 text-blue-600 rounded-full h-6 w-6 flex items-center justify-center font-bold text-sm">
              {index + 1}
            </span>
            <span className="flex-1 text-gray-700" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text) }} />
          </li>
        ))}
      </ol>
    </div>
  );
}
