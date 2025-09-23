package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "cli-app2",
	Short: "cli-app2 is a CLI application",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Hello from cli-app2!")
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
