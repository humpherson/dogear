import {
  Layers,
  Music,
  Tv,
  BookOpen,
  Speech,
  PawPrint,
  User,
  Laugh,
  Frown,
  Star,
  Brush,
} from 'lucide-react';
export const collectionIcons = [
  { id: 'layers', name: 'Layers', Icon: Layers },
  { id: 'music', name: 'Music', Icon: Music },
  { id: 'tv', name: 'TV', Icon: Tv },
  { id: 'book', name: 'Book', Icon: BookOpen },
  { id: 'speech', name: 'Speech', Icon: Speech },
  { id: 'paw-print', name: 'Paw print', Icon: PawPrint },
  { id: 'user', name: 'User', Icon: User },
  { id: 'face-grinning', name: 'Grinning face', Icon: Laugh },
  { id: 'face-slightly-frowning', name: 'Slightly frowning face', Icon: Frown },
  { id: 'star', name: 'Star', Icon: Star },
  { id: 'brush', name: 'Brush', Icon: Brush },
] as const;
export function findCollectionIcon(id?: string) {
  return collectionIcons.find((icon) => icon.id === id) || collectionIcons[0];
}
