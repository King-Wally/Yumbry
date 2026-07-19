import ImageUpload from './ImageUpload';

export interface InstructionDraft {
  id?: number;
  text: string;
  image_path?: string | null;
}

interface InstructionListEditorProps {
  instructions: InstructionDraft[];
  onChange: (instructions: InstructionDraft[]) => void;
  onUploadStepPhoto?: (stepId: number, file: File) => void;
}

export default function InstructionListEditor({
  instructions,
  onChange,
  onUploadStepPhoto,
}: InstructionListEditorProps) {
  function updateText(index: number, text: string) {
    const next = [...instructions];
    next[index] = { ...next[index], text };
    onChange(next);
  }

  function addStep() {
    onChange([...instructions, { text: '' }]);
  }

  function removeStep(index: number) {
    onChange(instructions.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= instructions.length) return;
    const next = [...instructions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-stone-700">Instructions</label>
      {instructions.map((step, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-2 w-6 text-sm text-stone-400">{index + 1}.</span>
          <div className="flex-1 space-y-2">
            <textarea
              value={step.text}
              onChange={(e) => updateText(index, e.target.value)}
              rows={2}
              placeholder="Describe this step"
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
            />
            {step.id && onUploadStepPhoto && (
              <ImageUpload
                currentUrl={step.image_path}
                label="Step photo"
                onUpload={(file) => onUploadStepPhoto(step.id!, file)}
              />
            )}
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => moveStep(index, -1)}
              className="text-stone-400 hover:text-stone-700"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveStep(index, 1)}
              className="text-stone-400 hover:text-stone-700"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeStep(index)}
              className="text-stone-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
      >
        + Add step
      </button>
    </div>
  );
}
