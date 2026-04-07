import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
} from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Bubble } from "@/components/Bubble";
import { MAPLIBRE_DEMO_STYLE } from "@/constants/MAPLIBRE_DEMO_STYLE";

/**
 * Reproduction for #1420.
 *
 * On iOS this scene exposes three independent bugs that together make a
 * draggable ViewAnnotation with a custom React Native view child unusable:
 *
 *   1. `self.annotation` is never set in the custom-view path of
 *      MLRNPointAnnotation. Long-pressing the magenta circle to start a drag
 *      crashes the app immediately with:
 *        NSInvalidArgumentException: Annotation property should not be nil.
 *
 *   2. `reactSetFrame:` removes and re-adds the annotation on every Fabric
 *      commit. While a drag is in progress (state == Starting/Dragging),
 *      this nulls out view.annotation and cancels the drag gesture. The
 *      streaming GeoJSONSource below provides the steady stream of Fabric
 *      commits needed to trigger this — without it, the bug only fires
 *      occasionally during normal interaction.
 *
 *   3. MapLibre Native's annotation reposition path re-projects every
 *      annotation view from its `coordinate` on every map redraw and
 *      assigns the result to view.center. During a drag, `coordinate` is
 *      stale (only updated at drag end), so the view snaps back to its
 *      original location on every redraw, fighting the drag gesture's
 *      own setCenter calls.
 *
 * To reproduce: long-press and drag the magenta circle. With the maintained
 * 11.0.0-beta.25 you'll see (depending on which bug wins the race):
 *   - immediate crash, OR
 *   - drag never visually moves, OR
 *   - drag follows the finger but snaps back constantly.
 *
 * With this PR's fixes applied: drag follows the finger smoothly and the
 * annotation is left where you released it.
 */
function DraggableViewAnnotationExample() {
  const [lngLat, setLngLat] = useState<[number, number]>([0, 0]);

  // A frequently-updating GeoJSONSource. We rotate a single point through a
  // small circle a few times a second to force a steady stream of React
  // re-renders and map redraws while the user is trying to drag.
  const [tickPoint, setTickPoint] = useState<[number, number]>([0, 0]);
  const tickRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      const angle = (tickRef.current * Math.PI) / 12;
      setTickPoint([Math.cos(angle) * 30, Math.sin(angle) * 30]);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const tickGeoJSON = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: tickPoint,
        },
        properties: {},
      },
    ],
  };

  return (
    <>
      <Map mapStyle={MAPLIBRE_DEMO_STYLE}>
        <Camera
          initialViewState={{
            center: [0, 0],
            zoom: 1,
          }}
        />

        {/* Frequently-updating source — drives Fabric commits during drag. */}
        <GeoJSONSource id="tick-source" data={tickGeoJSON}>
          <Layer
            id="tick-layer"
            type="circle"
            paint={{
              "circle-radius": 6,
              "circle-color": "#4ECDC4",
            }}
          />
        </GeoJSONSource>

        {/* The draggable ViewAnnotation under test. */}
        <ViewAnnotation
          id="draggable-test"
          lngLat={lngLat}
          anchor="center"
          draggable
          onDragEnd={(event) => {
            setLngLat(event.nativeEvent.lngLat);
          }}
        >
          <View style={styles.marker} />
        </ViewAnnotation>
      </Map>

      <Bubble>
        <Text style={styles.bubbleText}>
          Long-press the magenta circle and drag it.
        </Text>
        <Text style={styles.bubbleText}>
          Without this PR&apos;s fixes the drag will crash, freeze, or
          snap back.
        </Text>
      </Bubble>
    </>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "magenta",
    borderWidth: 3,
    borderColor: "white",
  },
  bubbleText: {
    textAlign: "center",
    paddingHorizontal: 16,
  },
});

export { DraggableViewAnnotationExample as DraggableViewAnnotation };
