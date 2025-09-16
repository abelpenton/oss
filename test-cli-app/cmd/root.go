package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "test-cli-app",
	Short: "test-cli-app is a CLI application",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Hello from test-cli-app!, testing release")
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
