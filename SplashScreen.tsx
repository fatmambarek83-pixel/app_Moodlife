// SplashScreen.tsx - Fichier séparé
import React, { useEffect, useRef } from "react";
import { 
  View, 
  Image, 
  Text, 
  StyleSheet, 
  StatusBar,
  Animated,
} from "react-native";

export default function SplashScreen(): JSX.Element {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: slideAnim }
            ],
          },
        ]}
      >
        <Image
          source={require("./assets/logo.png")}
          style={styles.logo}
        />
        
        <Animated.Text style={[styles.tagline, { opacity: fadeAnim }]}>
          Votre compagnon quotidien
        </Animated.Text>
      </Animated.View>

      <Animated.View 
        style={[
          styles.footer,
          { opacity: fadeAnim }
        ]}
      >
        <Text style={styles.from}>from</Text>
        <Text style={styles.meta}>FN&FM</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E1B3A",
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    alignItems: "center",
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 20,
  },
  tagline: {
    color: "#A78BFA",
    fontSize: 16,
    fontStyle: "italic",
    marginTop: 12,
  },
  footer: {
    position: "absolute",
    bottom: 80,
    alignItems: "center",
  },
  from: {
    color: "#A78BFA",
    fontSize: 14,
  },
  meta: {
    color: "#7C3AED",
    fontWeight: "bold",
    fontSize: 18,
    marginTop: 4,
  },
});