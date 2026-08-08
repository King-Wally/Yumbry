import { useState, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface ReorderableListEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  label: string;
  addLabel: string;
  dragHandleLabel: string;
  rowClassName?: string;
  controlsClassName?: string;
  handleClassName?: string;
}

/**
 * Rows need a key that travels with the item across reorders, but neither item type carries one:
 * ingredients are plain strings (duplicates are legitimate) and an instruction's `id` only exists
 * once it has been persisted. So we keep a parallel array of generated ids here, reconciled
 * against the item count during render and moved in lockstep with the items themselves.
 */
interface RowIds {
  ids: string[];
  /** Monotonic counter so an id is never reused after a row is removed. */
  next: number;
}

function reconcile(state: RowIds, count: number): RowIds {
  if (state.ids.length === count) return state;
  if (state.ids.length > count) return { ...state, ids: state.ids.slice(0, count) };
  const grown = Array.from({ length: count - state.ids.length }, (_, i) => `row-${state.next + i}`);
  return { ids: [...state.ids, ...grown], next: state.next + grown.length };
}

function useStableRowIds(count: number) {
  const [state, setState] = useState<RowIds>(() => reconcile({ ids: [], next: 0 }, count));

  // Sync in render (not useEffect) so the ids are always in step with the items we are about to
  // render — matching the render-time state sync used in RecipeFormPage.
  const current = reconcile(state, count);
  if (current !== state) setState(current);

  return {
    ids: current.ids,
    removeIdAt(index: number) {
      setState((prev) => ({ ...prev, ids: prev.ids.filter((_, i) => i !== index) }));
    },
    moveId(from: number, to: number) {
      setState((prev) => ({ ...prev, ids: arrayMove(prev.ids, from, to) }));
    },
  };
}

interface SortableRowProps {
  id: string;
  className: string;
  handleClassName?: string;
  dragHandleLabel: string;
  children: ReactNode;
}

function SortableRow({
  id,
  className,
  handleClassName,
  dragHandleLabel,
  children,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className}${isDragging ? ' relative z-10 opacity-60' : ''}`}
    >
      <button
        type="button"
        aria-label={dragHandleLabel}
        className={`touch-none cursor-grab text-stone-400 hover:text-stone-700 active:cursor-grabbing${
          handleClassName ? ` ${handleClassName}` : ''
        }`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  );
}

export default function ReorderableListEditor<T>({
  items,
  onChange,
  createItem,
  renderItem,
  label,
  addLabel,
  dragHandleLabel,
  rowClassName = 'flex items-center gap-2',
  controlsClassName = 'flex items-center gap-2',
  handleClassName,
}: ReorderableListEditorProps<T>) {
  const { ids, removeIdAt, moveId } = useStableRowIds(items.length);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function updateItem(index: number, next: T) {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  }

  function addItem() {
    onChange([...items, createItem()]);
  }

  function removeItem(index: number) {
    removeIdAt(index);
    onChange(items.filter((_, i) => i !== index));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    moveId(from, to);
    onChange(arrayMove(items, from, to));
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-stone-700">{label}</label>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item, index) => (
              <SortableRow
                key={ids[index]}
                id={ids[index]}
                className={rowClassName}
                handleClassName={handleClassName}
                dragHandleLabel={dragHandleLabel}
              >
                {renderItem(item, (next) => updateItem(index, next), index)}
                <div className={controlsClassName}>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-stone-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={addItem}
        className="rounded-md border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-clay hover:text-clay"
      >
        {addLabel}
      </button>
    </div>
  );
}
