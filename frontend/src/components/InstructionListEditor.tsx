import ReorderableListEditor from './ReorderableListEditor';

export interface InstructionDraft {
  id?: number;
  text: string;
}

interface InstructionListEditorProps {
  instructions: InstructionDraft[];
  onChange: (instructions: InstructionDraft[]) => void;
}

export default function InstructionListEditor({
  instructions,
  onChange,
}: InstructionListEditorProps) {
  return (
    <ReorderableListEditor
      items={instructions}
      onChange={onChange}
      createItem={() => ({ text: '' })}
      label="Instructions"
      addLabel="+ Add step"
      rowClassName="flex items-start gap-2"
      controlsClassName="mt-2 flex items-center gap-2"
      renderItem={(step, update, index) => (
        <>
          <span className="mt-2 w-6 text-sm text-stone-400">{index + 1}.</span>
          <div className="flex-1 space-y-2">
            <textarea
              value={step.text}
              onChange={(e) => update({ ...step, text: e.target.value })}
              rows={2}
              placeholder="Describe this step"
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 focus:border-clay focus:outline-none"
            />
          </div>
        </>
      )}
    />
  );
}
