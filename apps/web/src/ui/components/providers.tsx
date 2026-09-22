"use client";

import "@ant-design/v5-patch-for-react-19";
import { App as AntApp, ConfigProvider, theme } from "antd";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#4f46e5",
          borderRadius: 8,
          fontSize: 14,
          colorBgLayout: "#f7f7f8",
        },
        components: {
          Layout: { siderBg: "#ffffff", headerBg: "#ffffff" },
          Menu: {
            itemSelectedBg: "#eef2ff",
            itemSelectedColor: "#4f46e5",
            itemBorderRadius: 8,
            itemMarginInline: 8,
          },
          Card: { borderRadiusLG: 12 },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
