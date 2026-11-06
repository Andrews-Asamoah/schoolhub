import {
  createContext,
  forwardRef,
  useContext,
  type ComponentRef,
} from "react";
import { Text as NativeText, StyleSheet, type TextProps } from "react-native";
/** Gallery-only multiplier. Native Dynamic Type remains enabled in production. */
export const FontPreviewContext = createContext(1);
export function usePreviewTextStyle<T>(style: T) {
  const scale = useContext(FontPreviewContext);
  const flat = StyleSheet.flatten(style as TextProps["style"]);
  return [
    style,
    scale !== 1 && {
      fontSize: (flat?.fontSize ?? 15) * scale,
      lineHeight: (flat?.lineHeight ?? 22) * scale,
    },
  ];
}
export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(
  function Text({ style, ...props }, ref) {
    const scaled = usePreviewTextStyle(style);
    return <NativeText {...props} ref={ref} style={scaled} />;
  },
);
