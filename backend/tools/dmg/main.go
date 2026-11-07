package main

import (
	"fmt"
	"os"

	dmg "github.com/jetbrains/go-dmg-writer"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "Usage: packpanel-dmg SOURCE OUTPUT")
		os.Exit(2)
	}
	image := &dmg.DMG{
		VolumeName:   "PackPanel",
		OwnerID:      dmg.OwnerIDUnset,
		GroupID:      dmg.OwnerIDUnset,
		PartitionMap: true,
	}
	if err := image.Create(os.Args[1], os.Args[2], dmg.ModeReadOnlyCompressed); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
