import type { Metadata } from "next";
import { DeliveryTrackingView } from "@/components/delivery-tracking/delivery-tracking-view";

export const metadata: Metadata = {
  title: "Delivery Tracking · AsiaMight Operations",
};

export default function DeliveryTrackingPage() {
  return <DeliveryTrackingView />;
}
