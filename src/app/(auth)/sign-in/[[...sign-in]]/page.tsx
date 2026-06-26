import { SignIn } from "@clerk/nextjs";

const clerkAppearance = {
  elements: {
    formButtonPrimary:
      "bg-[#173B3D] hover:bg-[#2D6668] text-white font-medium rounded-full",
    card: "shadow-none",
    headerTitle: "text-[#173B3D] font-normal",
    headerSubtitle: "text-[#173B3D]/40",
    socialButtonsBlockButton:
      "border border-[#173B3D]/15 text-[#173B3D] hover:bg-[#F7EEE0] rounded-full",
    formFieldLabel: "text-[#173B3D] font-medium",
    formFieldInput:
      "border-[#173B3D]/15 focus:border-[#173B3D] focus:ring-[#173B3D]/15 rounded-[14px]",
    footerAction: "hidden",
    footerActionLink: "text-[#173B3D] hover:text-[#2D6668]",
    identityPreviewEditButton: "text-[#173B3D]",
  },
  variables: {
    colorPrimary: "#173B3D",
    colorText: "#173B3D",
    colorTextSecondary: "rgba(23, 59, 61, 0.4)",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#173B3D",
    borderRadius: "14px",
  },
};

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />;
}
