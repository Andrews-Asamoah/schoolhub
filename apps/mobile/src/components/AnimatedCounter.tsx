import { useEffect } from "react";
import { TextInput, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { type, useTheme } from "@/theme/theme";
import { usePreviewTextStyle } from "./Typography";
const AnimatedInput = Animated.createAnimatedComponent(TextInput);
/** Number updates run on the UI thread; assistive technology reads the final value once. */
export function AnimatedCounter({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const { colors, reduceMotion } = useTheme();
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const amount = useSharedValue(target);
  useEffect(() => {
    amount.set(reduceMotion ? target : withTiming(target, { duration: 200 }));
  }, [target, reduceMotion, amount]);
  const animatedProps = useAnimatedProps(() => ({
    text: String(Math.round(amount.value)),
    defaultValue: String(Math.round(amount.value)),
  }));
  const style = usePreviewTextStyle({
    ...type.display,
    color: colors.foreground,
    padding: 0,
  });
  return (
    <View accessible accessibilityLabel={`${label}: ${target}`}>
      <AnimatedInput
        accessible={false}
        importantForAccessibility="no"
        editable={false}
        caretHidden
        defaultValue={String(target)}
        animatedProps={animatedProps}
        style={style}
      />
    </View>
  );
}
