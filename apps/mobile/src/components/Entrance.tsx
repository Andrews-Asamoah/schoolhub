import type { ReactNode } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/theme/theme";
export function Entrance({
  children,
  index = 0,
}: {
  children: ReactNode;
  index?: number;
}) {
  const { reduceMotion } = useTheme();
  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.duration(180).delay(Math.min(Math.max(0, index), 3) * 20)
      }
    >
      {children}
    </Animated.View>
  );
}
